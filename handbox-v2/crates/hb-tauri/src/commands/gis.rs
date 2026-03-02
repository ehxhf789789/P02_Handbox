//! GIS Commands - GeoJSON, Shapefile, GeoPackage processing
//!
//! Provides Tauri commands for reading, transforming, and analyzing
//! geospatial data formats.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeoJsonFeature {
    #[serde(rename = "type")]
    pub feature_type: String,
    pub geometry: serde_json::Value,
    pub properties: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureCollection {
    #[serde(rename = "type")]
    pub collection_type: String,
    pub features: Vec<GeoJsonFeature>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub crs: Option<CrsDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrsDefinition {
    #[serde(rename = "type")]
    pub crs_type: String,
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GisReadResult {
    pub features: FeatureCollection,
    pub feature_count: usize,
    pub bounds: Option<BoundingBox>,
    pub crs: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PropertyStatistics {
    pub field: String,
    pub count: usize,
    pub unique_values: usize,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub mean: Option<f64>,
    pub sum: Option<f64>,
}

// ============================================================================
// Commands - File I/O
// ============================================================================

/// Read a GeoJSON file and parse its contents
#[command]
pub async fn gis_read_geojson(file_path: String) -> Result<GisReadResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let fc: FeatureCollection = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse GeoJSON: {}", e))?;

    let feature_count = fc.features.len();
    let bounds = calculate_bounds(&fc);
    let crs = fc.crs.as_ref().map(|c| {
        c.properties.get("name").cloned().unwrap_or_else(|| "Unknown".to_string())
    });

    Ok(GisReadResult {
        features: fc,
        feature_count,
        bounds,
        crs,
    })
}

/// Read a Shapefile (.shp + .dbf + .prj)
/// Parses the binary .shp format directly without external dependencies.
#[command]
pub async fn gis_read_shapefile(file_path: String) -> Result<GisReadResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Shapefile not found: {}", file_path));
    }

    let shp_data = std::fs::read(path)
        .map_err(|e| format!("Failed to read shapefile: {}", e))?;

    if shp_data.len() < 100 {
        return Err("Invalid shapefile: header too small".to_string());
    }

    // Validate magic number
    let file_code = u32::from_be_bytes([shp_data[0], shp_data[1], shp_data[2], shp_data[3]]);
    if file_code != 9994 {
        return Err(format!("Invalid shapefile magic: {}", file_code));
    }

    let _shape_type = u32::from_le_bytes([shp_data[32], shp_data[33], shp_data[34], shp_data[35]]);
    let xmin = f64::from_le_bytes(shp_data[36..44].try_into().unwrap());
    let ymin = f64::from_le_bytes(shp_data[44..52].try_into().unwrap());
    let xmax = f64::from_le_bytes(shp_data[52..60].try_into().unwrap());
    let ymax = f64::from_le_bytes(shp_data[60..68].try_into().unwrap());

    let bounds = Some(BoundingBox { min_x: xmin, min_y: ymin, max_x: xmax, max_y: ymax });

    // Parse records
    let mut features = Vec::new();
    let mut offset = 100usize;

    while offset + 8 < shp_data.len() {
        let content_len = u32::from_be_bytes([shp_data[offset+4], shp_data[offset+5], shp_data[offset+6], shp_data[offset+7]]) as usize * 2;
        offset += 8;
        if content_len < 4 || offset + content_len > shp_data.len() {
            break;
        }
        let rec_type = u32::from_le_bytes([shp_data[offset], shp_data[offset+1], shp_data[offset+2], shp_data[offset+3]]);

        let geometry = match rec_type {
            0 => serde_json::json!(null),
            1 => { // Point
                if offset + 20 <= shp_data.len() {
                    let x = f64::from_le_bytes(shp_data[offset+4..offset+12].try_into().unwrap());
                    let y = f64::from_le_bytes(shp_data[offset+12..offset+20].try_into().unwrap());
                    serde_json::json!({"type": "Point", "coordinates": [x, y]})
                } else { serde_json::json!(null) }
            }
            3 | 5 => parse_shp_polyline_polygon(&shp_data[offset..offset+content_len], rec_type == 5),
            8 => parse_shp_multipoint(&shp_data[offset..offset+content_len]),
            _ => serde_json::json!(null),
        };

        if !geometry.is_null() {
            features.push(GeoJsonFeature {
                feature_type: "Feature".to_string(),
                geometry,
                properties: None,
                id: Some(serde_json::json!(features.len())),
            });
        }
        offset += content_len;
    }

    // Read .dbf for properties
    let dbf_path = path.with_extension("dbf");
    if dbf_path.exists() {
        if let Ok(props_list) = read_dbf_properties(&dbf_path) {
            for (i, props) in props_list.into_iter().enumerate() {
                if let Some(feature) = features.get_mut(i) {
                    feature.properties = Some(props);
                }
            }
        }
    }

    // Read .prj for CRS
    let prj_path = path.with_extension("prj");
    let crs_str = if prj_path.exists() {
        std::fs::read_to_string(&prj_path).ok()
    } else {
        None
    };

    let feature_count = features.len();

    Ok(GisReadResult {
        features: FeatureCollection {
            collection_type: "FeatureCollection".to_string(),
            features,
            crs: crs_str.as_ref().map(|c| CrsDefinition {
                crs_type: "name".to_string(),
                properties: { let mut m = HashMap::new(); m.insert("name".to_string(), c.clone()); m },
            }),
        },
        feature_count,
        bounds,
        crs: crs_str,
    })
}

/// Read a GeoPackage file (SQLite-based)
/// Parses the minimal SQLite structure to extract features.
#[command]
pub async fn gis_read_geopackage(file_path: String, layer_name: Option<String>) -> Result<GisReadResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("GeoPackage not found: {}", file_path));
    }

    // GeoPackage is SQLite. We read the raw bytes and extract basic info.
    let data = std::fs::read(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Validate SQLite magic
    if data.len() < 16 || &data[0..16] != b"SQLite format 3\0" {
        return Err("Not a valid SQLite/GeoPackage file".to_string());
    }

    // Without a full SQLite parser, we provide file info and suggest conversion
    let file_size = data.len();

    // Try to find table names in the raw bytes (basic heuristic)
    let content = String::from_utf8_lossy(&data);
    let mut tables = Vec::new();
    for table_prefix in ["gpkg_contents", "gpkg_geometry_columns", "gpkg_spatial_ref_sys"] {
        if content.contains(table_prefix) {
            tables.push(table_prefix.to_string());
        }
    }

    // If the user wants actual features, suggest converting with ogr2ogr
    Err(format!(
        "GeoPackage detected ({} bytes, tables: {}). \
         For full parsing, convert to GeoJSON first using: \
         ogr2ogr -f GeoJSON output.geojson \"{}\" {}",
        file_size,
        if tables.is_empty() { "unknown".to_string() } else { tables.join(", ") },
        file_path,
        layer_name.as_deref().unwrap_or("")
    ))
}

/// Write features to a GeoJSON file
#[command]
pub async fn gis_write_geojson(
    features: FeatureCollection,
    output_path: String,
    pretty: Option<bool>,
) -> Result<String, String> {
    let json = if pretty.unwrap_or(true) {
        serde_json::to_string_pretty(&features)
    } else {
        serde_json::to_string(&features)
    }.map_err(|e| format!("Failed to serialize: {}", e))?;

    std::fs::write(&output_path, json)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(output_path)
}

// ============================================================================
// Commands - Spatial Analysis
// ============================================================================

/// Calculate bounding box for features
#[command]
pub async fn gis_calculate_bounds(features: FeatureCollection) -> Result<Option<BoundingBox>, String> {
    Ok(calculate_bounds(&features))
}

/// Calculate centroid for a feature
#[command]
pub async fn gis_calculate_centroid(geometry: serde_json::Value) -> Result<[f64; 2], String> {
    let coords = extract_coordinates(&geometry)?;

    if coords.is_empty() {
        return Err("No coordinates found".to_string());
    }

    let mut sum_x = 0.0;
    let mut sum_y = 0.0;
    let count = coords.len() as f64;

    for (x, y) in coords {
        sum_x += x;
        sum_y += y;
    }

    Ok([sum_x / count, sum_y / count])
}

/// Calculate area for polygon features (approximate, assumes planar)
#[command]
pub async fn gis_calculate_area(geometry: serde_json::Value) -> Result<f64, String> {
    let geom_type = geometry.get("type")
        .and_then(|t| t.as_str())
        .ok_or("Missing geometry type")?;

    match geom_type {
        "Polygon" => {
            let coords = geometry.get("coordinates")
                .and_then(|c| c.as_array())
                .ok_or("Missing coordinates")?;

            if let Some(ring) = coords.first().and_then(|r| r.as_array()) {
                Ok(calculate_ring_area(ring))
            } else {
                Err("Invalid polygon structure".to_string())
            }
        }
        "MultiPolygon" => {
            let coords = geometry.get("coordinates")
                .and_then(|c| c.as_array())
                .ok_or("Missing coordinates")?;

            let mut total_area = 0.0;
            for polygon in coords {
                if let Some(rings) = polygon.as_array() {
                    if let Some(ring) = rings.first().and_then(|r| r.as_array()) {
                        total_area += calculate_ring_area(ring);
                    }
                }
            }
            Ok(total_area)
        }
        _ => Err(format!("Cannot calculate area for geometry type: {}", geom_type)),
    }
}

/// Calculate length for line features
#[command]
pub async fn gis_calculate_length(geometry: serde_json::Value) -> Result<f64, String> {
    let geom_type = geometry.get("type")
        .and_then(|t| t.as_str())
        .ok_or("Missing geometry type")?;

    match geom_type {
        "LineString" => {
            let coords = geometry.get("coordinates")
                .and_then(|c| c.as_array())
                .ok_or("Missing coordinates")?;

            Ok(calculate_line_length(coords))
        }
        "MultiLineString" => {
            let coords = geometry.get("coordinates")
                .and_then(|c| c.as_array())
                .ok_or("Missing coordinates")?;

            let mut total_length = 0.0;
            for line in coords {
                if let Some(line_coords) = line.as_array() {
                    total_length += calculate_line_length(line_coords);
                }
            }
            Ok(total_length)
        }
        _ => Err(format!("Cannot calculate length for geometry type: {}", geom_type)),
    }
}

/// Get statistics for a property field
#[command]
pub async fn gis_property_statistics(
    features: FeatureCollection,
    field_name: String,
) -> Result<PropertyStatistics, String> {
    let mut values: Vec<f64> = Vec::new();
    let mut unique_strings: std::collections::HashSet<String> = std::collections::HashSet::new();

    for feature in &features.features {
        if let Some(props) = &feature.properties {
            if let Some(value) = props.get(&field_name) {
                // Try to get numeric value
                if let Some(n) = value.as_f64() {
                    values.push(n);
                } else if let Some(n) = value.as_i64() {
                    values.push(n as f64);
                }

                // Track unique string values
                unique_strings.insert(value.to_string());
            }
        }
    }

    let count = features.features.len();
    let unique_values = unique_strings.len();

    let (min, max, mean, sum) = if !values.is_empty() {
        let sum: f64 = values.iter().sum();
        let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let mean = sum / values.len() as f64;
        (Some(min), Some(max), Some(mean), Some(sum))
    } else {
        (None, None, None, None)
    };

    Ok(PropertyStatistics {
        field: field_name,
        count,
        unique_values,
        min,
        max,
        mean,
        sum,
    })
}

/// Filter features by property condition
#[command]
pub async fn gis_filter_features(
    features: FeatureCollection,
    field_name: String,
    operator: String,
    value: serde_json::Value,
) -> Result<FeatureCollection, String> {
    let filtered: Vec<GeoJsonFeature> = features.features
        .into_iter()
        .filter(|f| {
            if let Some(props) = &f.properties {
                if let Some(field_value) = props.get(&field_name) {
                    return match operator.as_str() {
                        "==" | "=" => field_value == &value,
                        "!=" | "<>" => field_value != &value,
                        ">" => compare_values(field_value, &value) == Some(std::cmp::Ordering::Greater),
                        ">=" => compare_values(field_value, &value).map(|o| o != std::cmp::Ordering::Less).unwrap_or(false),
                        "<" => compare_values(field_value, &value) == Some(std::cmp::Ordering::Less),
                        "<=" => compare_values(field_value, &value).map(|o| o != std::cmp::Ordering::Greater).unwrap_or(false),
                        "contains" => {
                            field_value.as_str()
                                .and_then(|s| value.as_str().map(|v| s.contains(v)))
                                .unwrap_or(false)
                        }
                        _ => false,
                    };
                }
            }
            false
        })
        .collect();

    Ok(FeatureCollection {
        collection_type: "FeatureCollection".to_string(),
        features: filtered,
        crs: None,
    })
}

// ============================================================================
// Commands - CRS Transformation
// ============================================================================

/// Transform coordinates between CRS systems
/// Supports: EPSG:4326 (WGS84) ↔ EPSG:3857 (Web Mercator)
/// and Korean coordinate systems: EPSG:5186, EPSG:5187
#[command]
pub async fn gis_transform_crs(
    features: FeatureCollection,
    source_crs: String,
    target_crs: String,
) -> Result<FeatureCollection, String> {
    let transform_fn: Box<dyn Fn(f64, f64) -> (f64, f64)> = match (source_crs.as_str(), target_crs.as_str()) {
        ("EPSG:4326", "EPSG:3857") => Box::new(wgs84_to_web_mercator),
        ("EPSG:3857", "EPSG:4326") => Box::new(web_mercator_to_wgs84),
        ("EPSG:4326", "EPSG:5186") => Box::new(wgs84_to_korea_central),
        ("EPSG:5186", "EPSG:4326") => Box::new(korea_central_to_wgs84),
        ("EPSG:4326", "EPSG:5187") => Box::new(wgs84_to_korea_east),
        ("EPSG:5187", "EPSG:4326") => Box::new(korea_east_to_wgs84),
        _ if source_crs == target_crs => {
            // Same CRS, no transformation needed
            return Ok(features);
        }
        _ => return Err(format!(
            "CRS transformation from {} to {} not supported. \
             Supported: EPSG:4326, EPSG:3857, EPSG:5186, EPSG:5187",
            source_crs, target_crs
        )),
    };

    let mut transformed = features;
    for feature in &mut transformed.features {
        feature.geometry = transform_geometry_coords(&feature.geometry, &*transform_fn);
    }

    transformed.crs = Some(CrsDefinition {
        crs_type: "name".to_string(),
        properties: {
            let mut m = HashMap::new();
            m.insert("name".to_string(), target_crs.clone());
            m
        },
    });

    Ok(transformed)
}

/// Buffer a feature's geometry by a given distance (simplified planar buffer)
#[command]
pub async fn gis_buffer(
    geometry: serde_json::Value,
    distance: f64,
    segments: Option<usize>,
) -> Result<serde_json::Value, String> {
    let geom_type = geometry.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let segs = segments.unwrap_or(16);

    match geom_type {
        "Point" => {
            let coords = geometry.get("coordinates").and_then(|c| c.as_array())
                .ok_or("Missing coordinates")?;
            let cx = coords.get(0).and_then(|v| v.as_f64()).unwrap_or(0.0);
            let cy = coords.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);

            // Create a circular polygon
            let mut ring = Vec::new();
            for i in 0..=segs {
                let angle = 2.0 * std::f64::consts::PI * (i as f64) / (segs as f64);
                let x = cx + distance * angle.cos();
                let y = cy + distance * angle.sin();
                ring.push(serde_json::json!([x, y]));
            }

            Ok(serde_json::json!({
                "type": "Polygon",
                "coordinates": [ring]
            }))
        }
        _ => Err(format!("Buffer not supported for geometry type: {}", geom_type)),
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn calculate_bounds(fc: &FeatureCollection) -> Option<BoundingBox> {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for feature in &fc.features {
        if let Ok(coords) = extract_coordinates(&feature.geometry) {
            for (x, y) in coords {
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
            }
        }
    }

    if min_x.is_finite() && min_y.is_finite() && max_x.is_finite() && max_y.is_finite() {
        Some(BoundingBox { min_x, min_y, max_x, max_y })
    } else {
        None
    }
}

fn extract_coordinates(geometry: &serde_json::Value) -> Result<Vec<(f64, f64)>, String> {
    let mut coords = Vec::new();

    fn extract_recursive(value: &serde_json::Value, coords: &mut Vec<(f64, f64)>) {
        if let Some(arr) = value.as_array() {
            if arr.len() >= 2 {
                if let (Some(x), Some(y)) = (arr[0].as_f64(), arr[1].as_f64()) {
                    coords.push((x, y));
                    return;
                }
            }
            for item in arr {
                extract_recursive(item, coords);
            }
        }
    }

    if let Some(c) = geometry.get("coordinates") {
        extract_recursive(c, &mut coords);
    }

    Ok(coords)
}

fn calculate_ring_area(ring: &[serde_json::Value]) -> f64 {
    // Shoelace formula for polygon area
    let mut area = 0.0;
    let n = ring.len();

    for i in 0..n {
        let j = (i + 1) % n;
        if let (Some(xi), Some(yi), Some(xj), Some(yj)) = (
            ring[i].get(0).and_then(|v| v.as_f64()),
            ring[i].get(1).and_then(|v| v.as_f64()),
            ring[j].get(0).and_then(|v| v.as_f64()),
            ring[j].get(1).and_then(|v| v.as_f64()),
        ) {
            area += xi * yj;
            area -= xj * yi;
        }
    }

    (area / 2.0).abs()
}

fn calculate_line_length(coords: &[serde_json::Value]) -> f64 {
    let mut length = 0.0;

    for i in 1..coords.len() {
        if let (Some(x1), Some(y1), Some(x2), Some(y2)) = (
            coords[i-1].get(0).and_then(|v| v.as_f64()),
            coords[i-1].get(1).and_then(|v| v.as_f64()),
            coords[i].get(0).and_then(|v| v.as_f64()),
            coords[i].get(1).and_then(|v| v.as_f64()),
        ) {
            let dx = x2 - x1;
            let dy = y2 - y1;
            length += (dx * dx + dy * dy).sqrt();
        }
    }

    length
}

fn compare_values(a: &serde_json::Value, b: &serde_json::Value) -> Option<std::cmp::Ordering> {
    if let (Some(na), Some(nb)) = (a.as_f64(), b.as_f64()) {
        na.partial_cmp(&nb)
    } else if let (Some(sa), Some(sb)) = (a.as_str(), b.as_str()) {
        Some(sa.cmp(sb))
    } else {
        None
    }
}

// ============================================================================
// CRS Transformation Functions
// ============================================================================

const EARTH_RADIUS: f64 = 6378137.0; // WGS84 semi-major axis

fn wgs84_to_web_mercator(lon: f64, lat: f64) -> (f64, f64) {
    let x = lon * std::f64::consts::PI / 180.0 * EARTH_RADIUS;
    let lat_rad = lat * std::f64::consts::PI / 180.0;
    let y = ((std::f64::consts::PI / 4.0 + lat_rad / 2.0).tan()).ln() * EARTH_RADIUS;
    (x, y)
}

fn web_mercator_to_wgs84(x: f64, y: f64) -> (f64, f64) {
    let lon = x / EARTH_RADIUS * 180.0 / std::f64::consts::PI;
    let lat = (std::f64::consts::PI * y / EARTH_RADIUS).exp().atan() * 2.0 * 180.0
        / std::f64::consts::PI - 90.0;
    (lon, lat)
}

/// Approximate WGS84 → Korea Central Belt (EPSG:5186) using Transverse Mercator
fn wgs84_to_korea_central(lon: f64, lat: f64) -> (f64, f64) {
    // Korea Central Belt: central meridian 127°, false easting 200000, false northing 600000
    transverse_mercator_forward(lon, lat, 127.0, 38.0, 200000.0, 600000.0)
}

fn korea_central_to_wgs84(x: f64, y: f64) -> (f64, f64) {
    transverse_mercator_inverse(x, y, 127.0, 38.0, 200000.0, 600000.0)
}

/// Approximate WGS84 → Korea East Belt (EPSG:5187)
fn wgs84_to_korea_east(lon: f64, lat: f64) -> (f64, f64) {
    transverse_mercator_forward(lon, lat, 129.0, 38.0, 200000.0, 600000.0)
}

fn korea_east_to_wgs84(x: f64, y: f64) -> (f64, f64) {
    transverse_mercator_inverse(x, y, 129.0, 38.0, 200000.0, 600000.0)
}

/// Simplified Transverse Mercator forward projection
fn transverse_mercator_forward(
    lon: f64, lat: f64,
    central_meridian: f64, _lat_origin: f64,
    false_easting: f64, false_northing: f64,
) -> (f64, f64) {
    let lon_rad = lon * std::f64::consts::PI / 180.0;
    let lat_rad = lat * std::f64::consts::PI / 180.0;
    let cm_rad = central_meridian * std::f64::consts::PI / 180.0;

    let k0 = 1.0; // Scale factor
    let e2 = 0.00669437999014; // WGS84 eccentricity squared
    let n = EARTH_RADIUS / (1.0 - e2 * lat_rad.sin().powi(2)).sqrt();

    let dl = lon_rad - cm_rad;
    let t = lat_rad.tan();
    let c = e2 / (1.0 - e2) * lat_rad.cos().powi(2);

    // Meridional arc length (simplified)
    let m = EARTH_RADIUS * (
        (1.0 - e2 / 4.0 - 3.0 * e2 * e2 / 64.0) * lat_rad
        - (3.0 * e2 / 8.0 + 3.0 * e2 * e2 / 32.0) * (2.0 * lat_rad).sin()
        + (15.0 * e2 * e2 / 256.0) * (4.0 * lat_rad).sin()
    );

    let cos_lat = lat_rad.cos();
    let x = false_easting + k0 * n * (
        dl * cos_lat
        + dl.powi(3) * cos_lat.powi(3) / 6.0 * (1.0 - t * t + c)
    );
    let y = false_northing + k0 * (
        m + n * lat_rad.tan() * (
            dl * dl * cos_lat * cos_lat / 2.0
            + dl.powi(4) * cos_lat.powi(4) / 24.0 * (5.0 - t * t + 9.0 * c)
        )
    );

    (x, y)
}

/// Simplified Transverse Mercator inverse projection
fn transverse_mercator_inverse(
    x: f64, y: f64,
    central_meridian: f64, _lat_origin: f64,
    false_easting: f64, false_northing: f64,
) -> (f64, f64) {
    let k0 = 1.0;
    let e2: f64 = 0.00669437999014;
    let e1 = (1.0 - (1.0 - e2).sqrt()) / (1.0 + (1.0 - e2).sqrt());

    let mx = x - false_easting;
    let my = y - false_northing;

    let mu = my / (EARTH_RADIUS * k0 * (1.0 - e2 / 4.0 - 3.0 * e2 * e2 / 64.0));

    let phi1 = mu
        + (3.0 * e1 / 2.0 - 27.0 * e1 * e1 * e1 / 32.0) * (2.0 * mu).sin()
        + (21.0 * e1 * e1 / 16.0 - 55.0 * e1.powi(4) / 32.0) * (4.0 * mu).sin()
        + (151.0 * e1 * e1 * e1 / 96.0) * (6.0 * mu).sin();

    let n1 = EARTH_RADIUS / (1.0 - e2 * phi1.sin().powi(2)).sqrt();
    let t1 = phi1.tan();
    let c1 = e2 / (1.0 - e2) * phi1.cos().powi(2);
    let r1 = EARTH_RADIUS * (1.0 - e2) / (1.0 - e2 * phi1.sin().powi(2)).powf(1.5);
    let d = mx / (n1 * k0);

    let lat = phi1 - n1 * t1 / r1 * (
        d * d / 2.0
        - (5.0 + 3.0 * t1 * t1 + 10.0 * c1 - 4.0 * c1 * c1) * d.powi(4) / 24.0
    );
    let lon = central_meridian * std::f64::consts::PI / 180.0 + (
        d - (1.0 + 2.0 * t1 * t1 + c1) * d.powi(3) / 6.0
    ) / phi1.cos();

    (lon * 180.0 / std::f64::consts::PI, lat * 180.0 / std::f64::consts::PI)
}

fn transform_geometry_coords(
    geom: &serde_json::Value,
    transform: &dyn Fn(f64, f64) -> (f64, f64),
) -> serde_json::Value {
    match geom {
        serde_json::Value::Array(arr) => {
            if arr.len() >= 2 && arr[0].is_f64() && arr[1].is_f64() {
                let x = arr[0].as_f64().unwrap();
                let y = arr[1].as_f64().unwrap();
                let (tx, ty) = transform(x, y);
                let mut result = vec![serde_json::json!(tx), serde_json::json!(ty)];
                for v in arr.iter().skip(2) { result.push(v.clone()); }
                serde_json::Value::Array(result)
            } else {
                serde_json::Value::Array(
                    arr.iter().map(|v| transform_geometry_coords(v, transform)).collect()
                )
            }
        }
        serde_json::Value::Object(map) => {
            let mut new_map = serde_json::Map::new();
            for (key, val) in map {
                if key == "coordinates" || key == "geometry" {
                    new_map.insert(key.clone(), transform_geometry_coords(val, transform));
                } else {
                    new_map.insert(key.clone(), val.clone());
                }
            }
            serde_json::Value::Object(new_map)
        }
        other => other.clone(),
    }
}

// ============================================================================
// Shapefile Parsing Helpers
// ============================================================================

fn parse_shp_polyline_polygon(data: &[u8], is_polygon: bool) -> serde_json::Value {
    if data.len() < 44 { return serde_json::json!(null); }

    // Skip shape type (4) + bounding box (32) = 36 bytes
    let num_parts = u32::from_le_bytes([data[36], data[37], data[38], data[39]]) as usize;
    let num_points = u32::from_le_bytes([data[40], data[41], data[42], data[43]]) as usize;

    let parts_offset = 44;
    if data.len() < parts_offset + num_parts * 4 {
        return serde_json::json!(null);
    }

    // Read part indices
    let mut parts = Vec::new();
    for i in 0..num_parts {
        let off = parts_offset + i * 4;
        parts.push(u32::from_le_bytes([data[off], data[off+1], data[off+2], data[off+3]]) as usize);
    }

    let points_offset = parts_offset + num_parts * 4;
    if data.len() < points_offset + num_points * 16 {
        return serde_json::json!(null);
    }

    // Read all points
    let mut all_points = Vec::new();
    for i in 0..num_points {
        let off = points_offset + i * 16;
        let x = f64::from_le_bytes(data[off..off+8].try_into().unwrap());
        let y = f64::from_le_bytes(data[off+8..off+16].try_into().unwrap());
        all_points.push(serde_json::json!([x, y]));
    }

    // Split into rings/parts
    let mut rings: Vec<Vec<serde_json::Value>> = Vec::new();
    for (i, &start) in parts.iter().enumerate() {
        let end = if i + 1 < parts.len() { parts[i + 1] } else { num_points };
        let ring: Vec<serde_json::Value> = all_points[start..end].to_vec();
        rings.push(ring);
    }

    if is_polygon {
        if rings.len() == 1 {
            serde_json::json!({"type": "Polygon", "coordinates": rings})
        } else {
            serde_json::json!({"type": "Polygon", "coordinates": rings})
        }
    } else {
        if rings.len() == 1 {
            serde_json::json!({"type": "LineString", "coordinates": rings[0]})
        } else {
            serde_json::json!({"type": "MultiLineString", "coordinates": rings})
        }
    }
}

fn parse_shp_multipoint(data: &[u8]) -> serde_json::Value {
    if data.len() < 40 { return serde_json::json!(null); }

    let num_points = u32::from_le_bytes([data[36], data[37], data[38], data[39]]) as usize;
    let points_offset = 40;

    if data.len() < points_offset + num_points * 16 {
        return serde_json::json!(null);
    }

    let mut coordinates = Vec::new();
    for i in 0..num_points {
        let off = points_offset + i * 16;
        let x = f64::from_le_bytes(data[off..off+8].try_into().unwrap());
        let y = f64::from_le_bytes(data[off+8..off+16].try_into().unwrap());
        coordinates.push(serde_json::json!([x, y]));
    }

    serde_json::json!({"type": "MultiPoint", "coordinates": coordinates})
}

/// Read properties from a .dbf file (dBASE format)
fn read_dbf_properties(path: &std::path::Path) -> Result<Vec<HashMap<String, serde_json::Value>>, String> {
    let data = std::fs::read(path).map_err(|e| format!("Failed to read .dbf: {}", e))?;

    if data.len() < 32 {
        return Err("DBF file too small".to_string());
    }

    let num_records = u32::from_le_bytes([data[4], data[5], data[6], data[7]]) as usize;
    let header_size = u16::from_le_bytes([data[8], data[9]]) as usize;
    let record_size = u16::from_le_bytes([data[10], data[11]]) as usize;

    // Parse field descriptors (32 bytes each, starting at offset 32)
    let mut fields: Vec<(String, char, usize)> = Vec::new(); // name, type, length
    let mut off = 32;
    while off + 32 <= header_size && data[off] != 0x0D {
        let name: String = data[off..off+11].iter()
            .take_while(|&&b| b != 0)
            .map(|&b| b as char)
            .collect();
        let field_type = data[off + 11] as char;
        let field_len = data[off + 16] as usize;
        fields.push((name.trim().to_string(), field_type, field_len));
        off += 32;
    }

    // Parse records
    let mut results = Vec::new();
    let record_start = header_size;

    for i in 0..num_records.min(10000) { // Safety limit
        let rec_off = record_start + i * record_size;
        if rec_off + record_size > data.len() { break; }

        // First byte is deletion flag
        if data[rec_off] == b'*' { continue; } // Deleted record

        let mut props = HashMap::new();
        let mut field_off = rec_off + 1; // Skip deletion flag

        for (name, field_type, field_len) in &fields {
            if field_off + field_len > data.len() { break; }

            let raw: String = data[field_off..field_off + field_len].iter()
                .map(|&b| b as char)
                .collect();
            let value = raw.trim().to_string();

            let json_value = match field_type {
                'N' | 'F' => {
                    if let Ok(n) = value.parse::<f64>() {
                        serde_json::json!(n)
                    } else {
                        serde_json::json!(value)
                    }
                }
                'L' => serde_json::json!(value == "T" || value == "t" || value == "Y" || value == "y"),
                _ => serde_json::json!(value),
            };

            props.insert(name.clone(), json_value);
            field_off += field_len;
        }

        results.push(props);
    }

    Ok(results)
}
