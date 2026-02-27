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

/// Read a Shapefile (reads .shp, .dbf, .prj as a set)
#[command]
pub async fn gis_read_shapefile(file_path: String) -> Result<GisReadResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("Shapefile not found: {}", file_path));
    }

    // For now, return a placeholder - actual shapefile parsing requires
    // additional dependencies like `shapefile` crate
    Err("Shapefile parsing not yet implemented. Use GeoJSON format.".to_string())
}

/// Read a GeoPackage file
#[command]
pub async fn gis_read_geopackage(file_path: String, _layer_name: Option<String>) -> Result<GisReadResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("GeoPackage not found: {}", file_path));
    }

    // GeoPackage is SQLite-based, requires sqlite dependency
    Err("GeoPackage parsing not yet implemented. Use GeoJSON format.".to_string())
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
