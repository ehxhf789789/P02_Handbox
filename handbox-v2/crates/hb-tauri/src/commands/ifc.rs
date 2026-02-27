//! IFC Commands - IFC 4x3 file parsing and analysis
//!
//! Provides Tauri commands for reading, analyzing, and extracting
//! data from IFC (Industry Foundation Classes) files.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::command;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcEntity {
    pub id: u64,
    pub entity_type: String,
    #[serde(rename = "GlobalId")]
    pub global_id: Option<String>,
    #[serde(rename = "Name")]
    pub name: Option<String>,
    #[serde(rename = "Description")]
    pub description: Option<String>,
    pub attributes: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcModel {
    pub schema: String,
    pub file_description: Option<String>,
    pub file_name: Option<String>,
    pub entities: HashMap<String, IfcEntity>,
    pub entity_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcHierarchyNode {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    pub children: Vec<IfcHierarchyNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcElementSummary {
    pub element_type: String,
    pub count: usize,
    pub instances: Vec<IfcEntityRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcEntityRef {
    pub id: String,
    pub name: Option<String>,
    pub global_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcProperty {
    pub name: String,
    pub value: serde_json::Value,
    pub property_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcPropertySet {
    pub name: String,
    pub properties: Vec<IfcProperty>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcQuantity {
    pub name: String,
    pub value: f64,
    pub unit: Option<String>,
    pub quantity_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcModelStatistics {
    pub schema: String,
    pub total_entities: usize,
    pub entity_types: HashMap<String, usize>,
    pub spatial_structure: Option<IfcHierarchyNode>,
    pub building_elements: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IfcReadResult {
    pub model: IfcModel,
    pub statistics: IfcModelStatistics,
}

// ============================================================================
// Commands - File I/O
// ============================================================================

/// Read and parse an IFC file
#[command]
pub async fn ifc_read_file(file_path: String) -> Result<IfcReadResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("IFC file not found: {}", file_path));
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let model = parse_ifc_content(&content)?;
    let statistics = calculate_statistics(&model);

    Ok(IfcReadResult { model, statistics })
}

/// Parse IFC content from string
#[command]
pub async fn ifc_parse_content(content: String) -> Result<IfcReadResult, String> {
    let model = parse_ifc_content(&content)?;
    let statistics = calculate_statistics(&model);

    Ok(IfcReadResult { model, statistics })
}

// ============================================================================
// Commands - Analysis
// ============================================================================

/// Extract spatial hierarchy (Project > Site > Building > Storey > Space)
#[command]
pub async fn ifc_extract_hierarchy(model: IfcModel) -> Result<Option<IfcHierarchyNode>, String> {
    Ok(build_spatial_hierarchy(&model))
}

/// Get element summary by type
#[command]
pub async fn ifc_get_element_summary(model: IfcModel) -> Result<Vec<IfcElementSummary>, String> {
    let mut summaries: HashMap<String, Vec<IfcEntityRef>> = HashMap::new();

    for (id, entity) in &model.entities {
        // Filter to building elements
        if is_building_element(&entity.entity_type) {
            let refs = summaries.entry(entity.entity_type.clone()).or_default();
            refs.push(IfcEntityRef {
                id: id.clone(),
                name: entity.name.clone(),
                global_id: entity.global_id.clone().unwrap_or_default(),
            });
        }
    }

    Ok(summaries
        .into_iter()
        .map(|(element_type, instances)| IfcElementSummary {
            count: instances.len(),
            element_type,
            instances,
        })
        .collect())
}

/// Get properties for an entity
#[command]
pub async fn ifc_get_entity_properties(
    model: IfcModel,
    entity_id: String,
) -> Result<Vec<IfcPropertySet>, String> {
    let entity = model.entities.get(&entity_id)
        .ok_or_else(|| format!("Entity not found: {}", entity_id))?;

    // Extract property sets from the entity's attributes
    let mut property_sets = Vec::new();

    // Basic attributes as a property set
    let mut basic_props = Vec::new();

    if let Some(name) = &entity.name {
        basic_props.push(IfcProperty {
            name: "Name".to_string(),
            value: serde_json::Value::String(name.clone()),
            property_type: "IfcLabel".to_string(),
        });
    }

    if let Some(desc) = &entity.description {
        basic_props.push(IfcProperty {
            name: "Description".to_string(),
            value: serde_json::Value::String(desc.clone()),
            property_type: "IfcText".to_string(),
        });
    }

    if let Some(gid) = &entity.global_id {
        basic_props.push(IfcProperty {
            name: "GlobalId".to_string(),
            value: serde_json::Value::String(gid.clone()),
            property_type: "IfcGloballyUniqueId".to_string(),
        });
    }

    if !basic_props.is_empty() {
        property_sets.push(IfcPropertySet {
            name: "Basic Properties".to_string(),
            properties: basic_props,
        });
    }

    // Additional attributes
    let mut attr_props: Vec<IfcProperty> = entity.attributes
        .iter()
        .filter(|(k, _)| !["Name", "Description", "GlobalId"].contains(&k.as_str()))
        .map(|(k, v)| IfcProperty {
            name: k.clone(),
            value: v.clone(),
            property_type: "IfcValue".to_string(),
        })
        .collect();

    if !attr_props.is_empty() {
        property_sets.push(IfcPropertySet {
            name: "Attributes".to_string(),
            properties: attr_props,
        });
    }

    Ok(property_sets)
}

/// Get quantities for an entity
#[command]
pub async fn ifc_get_entity_quantities(
    model: IfcModel,
    entity_id: String,
) -> Result<Vec<IfcQuantity>, String> {
    let entity = model.entities.get(&entity_id)
        .ok_or_else(|| format!("Entity not found: {}", entity_id))?;

    // Extract quantities from attributes
    let mut quantities = Vec::new();

    for (key, value) in &entity.attributes {
        if key.contains("Length") || key.contains("Area") || key.contains("Volume") ||
           key.contains("Width") || key.contains("Height") || key.contains("Depth") {
            if let Some(num) = value.as_f64() {
                let unit = if key.contains("Area") {
                    Some("m²".to_string())
                } else if key.contains("Volume") {
                    Some("m³".to_string())
                } else {
                    Some("m".to_string())
                };

                quantities.push(IfcQuantity {
                    name: key.clone(),
                    value: num,
                    unit,
                    quantity_type: determine_quantity_type(key),
                });
            }
        }
    }

    Ok(quantities)
}

/// Search entities by type or name
#[command]
pub async fn ifc_search_entities(
    model: IfcModel,
    query: String,
    entity_type: Option<String>,
) -> Result<Vec<IfcEntityRef>, String> {
    let query_lower = query.to_lowercase();

    let results: Vec<IfcEntityRef> = model.entities
        .iter()
        .filter(|(_, entity)| {
            // Filter by type if specified
            if let Some(ref et) = entity_type {
                if !entity.entity_type.eq_ignore_ascii_case(et) {
                    return false;
                }
            }

            // Search in name, description, and global id
            let name_match = entity.name.as_ref()
                .map(|n| n.to_lowercase().contains(&query_lower))
                .unwrap_or(false);

            let desc_match = entity.description.as_ref()
                .map(|d| d.to_lowercase().contains(&query_lower))
                .unwrap_or(false);

            let gid_match = entity.global_id.as_ref()
                .map(|g| g.to_lowercase().contains(&query_lower))
                .unwrap_or(false);

            name_match || desc_match || gid_match
        })
        .map(|(id, entity)| IfcEntityRef {
            id: id.clone(),
            name: entity.name.clone(),
            global_id: entity.global_id.clone().unwrap_or_default(),
        })
        .collect();

    Ok(results)
}

/// Get model statistics
#[command]
pub async fn ifc_get_statistics(model: IfcModel) -> Result<IfcModelStatistics, String> {
    Ok(calculate_statistics(&model))
}

// ============================================================================
// Commands - Export
// ============================================================================

/// Export model summary as JSON
#[command]
pub async fn ifc_export_summary_json(
    model: IfcModel,
    output_path: String,
) -> Result<String, String> {
    let stats = calculate_statistics(&model);
    let json = serde_json::to_string_pretty(&stats)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    std::fs::write(&output_path, json)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(output_path)
}

/// Export elements as CSV
#[command]
pub async fn ifc_export_elements_csv(
    model: IfcModel,
    output_path: String,
    element_types: Option<Vec<String>>,
) -> Result<String, String> {
    let mut csv = "GlobalId,Type,Name,Description\n".to_string();

    for (_, entity) in &model.entities {
        // Filter by type if specified
        if let Some(ref types) = element_types {
            if !types.iter().any(|t| entity.entity_type.eq_ignore_ascii_case(t)) {
                continue;
            }
        }

        if !is_building_element(&entity.entity_type) {
            continue;
        }

        let gid = entity.global_id.as_deref().unwrap_or("");
        let name = entity.name.as_deref().unwrap_or("");
        let desc = entity.description.as_deref().unwrap_or("");

        csv.push_str(&format!(
            "\"{}\",\"{}\",\"{}\",\"{}\"\n",
            gid, entity.entity_type, name, desc
        ));
    }

    std::fs::write(&output_path, csv)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(output_path)
}

// ============================================================================
// Helper Functions
// ============================================================================

fn parse_ifc_content(content: &str) -> Result<IfcModel, String> {
    let mut model = IfcModel {
        schema: "IFC4X3".to_string(),
        file_description: None,
        file_name: None,
        entities: HashMap::new(),
        entity_count: 0,
    };

    // Parse HEADER section
    if let Some(header_start) = content.find("HEADER;") {
        if let Some(header_end) = content.find("ENDSEC;") {
            let header = &content[header_start..header_end];

            // Extract FILE_DESCRIPTION
            if let Some(fd_start) = header.find("FILE_DESCRIPTION") {
                if let Some(fd_end) = header[fd_start..].find(");") {
                    model.file_description = Some(header[fd_start..fd_start+fd_end+2].to_string());
                }
            }

            // Extract FILE_SCHEMA to determine version
            if header.contains("IFC4X3") {
                model.schema = "IFC4X3".to_string();
            } else if header.contains("IFC4") {
                model.schema = "IFC4".to_string();
            } else if header.contains("IFC2X3") {
                model.schema = "IFC2X3".to_string();
            }
        }
    }

    // Parse DATA section
    if let Some(data_start) = content.find("DATA;") {
        if let Some(data_end) = content.rfind("ENDSEC;") {
            let data = &content[data_start+5..data_end];

            // Parse each entity line
            for line in data.lines() {
                let line = line.trim();

                // Skip empty lines and comments
                if line.is_empty() || line.starts_with("/*") {
                    continue;
                }

                // Parse entity: #123=IFCWALL(...)
                if let Some(eq_pos) = line.find('=') {
                    let id_str = line[1..eq_pos].trim();
                    if let Ok(id) = id_str.parse::<u64>() {
                        if let Some(paren_pos) = line.find('(') {
                            let entity_type = &line[eq_pos+1..paren_pos];

                            // Extract basic attributes
                            let entity = parse_entity(id, entity_type, line);
                            model.entities.insert(format!("#{}", id), entity);
                        }
                    }
                }
            }
        }
    }

    model.entity_count = model.entities.len();
    Ok(model)
}

fn parse_entity(id: u64, entity_type: &str, line: &str) -> IfcEntity {
    let mut entity = IfcEntity {
        id,
        entity_type: entity_type.to_string(),
        global_id: None,
        name: None,
        description: None,
        attributes: HashMap::new(),
    };

    // Extract content between parentheses
    if let Some(start) = line.find('(') {
        if let Some(end) = line.rfind(')') {
            let params = &line[start+1..end];
            let parts: Vec<&str> = split_ifc_params(params);

            // For most IFC entities, the order is:
            // GlobalId, OwnerHistory, Name, Description, ...
            if !parts.is_empty() && parts[0] != "$" && parts[0] != "*" {
                let gid = parts[0].trim_matches('\'');
                entity.global_id = Some(gid.to_string());
            }

            if parts.len() > 2 && parts[2] != "$" && parts[2] != "*" {
                let name = parts[2].trim_matches('\'');
                entity.name = Some(name.to_string());
            }

            if parts.len() > 3 && parts[3] != "$" && parts[3] != "*" {
                let desc = parts[3].trim_matches('\'');
                entity.description = Some(desc.to_string());
            }
        }
    }

    entity
}

fn split_ifc_params(params: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0;
    let mut start = 0;

    for (i, c) in params.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(params[start..i].trim());
                start = i + 1;
            }
            _ => {}
        }
    }

    if start < params.len() {
        parts.push(params[start..].trim());
    }

    parts
}

fn calculate_statistics(model: &IfcModel) -> IfcModelStatistics {
    let mut entity_types: HashMap<String, usize> = HashMap::new();
    let mut building_elements: HashMap<String, usize> = HashMap::new();

    for entity in model.entities.values() {
        *entity_types.entry(entity.entity_type.clone()).or_insert(0) += 1;

        if is_building_element(&entity.entity_type) {
            *building_elements.entry(entity.entity_type.clone()).or_insert(0) += 1;
        }
    }

    let spatial_structure = build_spatial_hierarchy(model);

    IfcModelStatistics {
        schema: model.schema.clone(),
        total_entities: model.entity_count,
        entity_types,
        spatial_structure,
        building_elements,
    }
}

fn build_spatial_hierarchy(model: &IfcModel) -> Option<IfcHierarchyNode> {
    // Find the project entity
    let project = model.entities.values()
        .find(|e| e.entity_type == "IFCPROJECT" || e.entity_type == "IfcProject")?;

    Some(IfcHierarchyNode {
        id: format!("#{}", project.id),
        name: project.name.clone().unwrap_or_else(|| "Project".to_string()),
        entity_type: project.entity_type.clone(),
        children: find_spatial_children(model, project.id),
    })
}

fn find_spatial_children(model: &IfcModel, _parent_id: u64) -> Vec<IfcHierarchyNode> {
    // In a full implementation, this would parse IfcRelAggregates relationships
    // For now, return a simple hierarchy based on entity types

    let spatial_types = ["IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE",
                        "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcSpace"];

    model.entities.values()
        .filter(|e| spatial_types.contains(&e.entity_type.as_str()))
        .map(|e| IfcHierarchyNode {
            id: format!("#{}", e.id),
            name: e.name.clone().unwrap_or_else(|| e.entity_type.clone()),
            entity_type: e.entity_type.clone(),
            children: vec![],
        })
        .collect()
}

fn is_building_element(entity_type: &str) -> bool {
    let building_elements = [
        "IFCWALL", "IFCWALLSTANDARDCASE", "IFCSLAB", "IFCBEAM", "IFCCOLUMN",
        "IFCDOOR", "IFCWINDOW", "IFCROOF", "IFCSTAIR", "IFCRAILING",
        "IFCCURTAINWALL", "IFCBUILDINGELEMENTPROXY", "IFCFURNISHINGELEMENT",
        "IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcBeam", "IfcColumn",
        "IfcDoor", "IfcWindow", "IfcRoof", "IfcStair", "IfcRailing",
        "IfcCurtainWall", "IfcBuildingElementProxy", "IfcFurnishingElement",
    ];

    building_elements.contains(&entity_type)
}

fn determine_quantity_type(key: &str) -> String {
    if key.contains("Length") { "IfcQuantityLength".to_string() }
    else if key.contains("Area") { "IfcQuantityArea".to_string() }
    else if key.contains("Volume") { "IfcQuantityVolume".to_string() }
    else if key.contains("Weight") { "IfcQuantityWeight".to_string() }
    else if key.contains("Count") { "IfcQuantityCount".to_string() }
    else { "IfcQuantityLength".to_string() }
}
