/**
 * IFC 4x3 Types — Complete type definitions for Industry Foundation Classes.
 *
 * Based on IFC 4.3 ADD2 specification (ISO 16739-1:2024)
 * https://standards.buildingsmart.org/IFC/RELEASE/IFC4x3/ADD2/HTML/
 *
 * Key concepts:
 * - Entity: Base class for all IFC objects
 * - Relationship: Connections between entities
 * - Property/Quantity Sets: Attribute groups
 * - Geometry: 3D representation
 */

// ========== Primitive Types ==========

/** IFC Global Unique Identifier (22 char base64) */
export type IfcGloballyUniqueId = string

/** IFC Label (text up to 255 chars) */
export type IfcLabel = string

/** IFC Text (unlimited text) */
export type IfcText = string

/** IFC Identifier */
export type IfcIdentifier = string

/** IFC Boolean */
export type IfcBoolean = boolean

/** IFC Logical (true/false/unknown) */
export type IfcLogical = true | false | 'UNKNOWN'

/** IFC Integer */
export type IfcInteger = number

/** IFC Real */
export type IfcReal = number

/** IFC Positive Length Measure */
export type IfcPositiveLengthMeasure = number

/** IFC Length Measure */
export type IfcLengthMeasure = number

/** IFC Area Measure */
export type IfcAreaMeasure = number

/** IFC Volume Measure */
export type IfcVolumeMeasure = number

/** IFC Plane Angle Measure (radians) */
export type IfcPlaneAngleMeasure = number

/** IFC Timestamp */
export type IfcTimeStamp = number

// ========== Core Classes ==========

/** Base entity interface */
export interface IfcEntity {
  id: number // STEP line number
  type: string // IFC class name
  globalId?: IfcGloballyUniqueId
  name?: IfcLabel
  description?: IfcText
}

/** Root entity (IfcRoot) */
export interface IfcRoot extends IfcEntity {
  globalId: IfcGloballyUniqueId
  ownerHistory?: IfcOwnerHistory
  name?: IfcLabel
  description?: IfcText
}

/** Owner History */
export interface IfcOwnerHistory extends IfcEntity {
  type: 'IfcOwnerHistory'
  owningUser: number // ref to IfcPersonAndOrganization
  owningApplication: number // ref to IfcApplication
  state?: 'READWRITE' | 'READONLY' | 'LOCKED' | 'READWRITELOCKED' | 'READONLYLOCKED'
  changeAction?: 'NOCHANGE' | 'MODIFIED' | 'ADDED' | 'DELETED' | 'NOTDEFINED'
  lastModifiedDate?: IfcTimeStamp
  lastModifyingUser?: number
  lastModifyingApplication?: number
  creationDate: IfcTimeStamp
}

/** Object Definition (IfcObjectDefinition) */
export interface IfcObjectDefinition extends IfcRoot {
  // Has inverse relationships for IsDecomposedBy, Decomposes, HasAssociations
}

/** Object (IfcObject) */
export interface IfcObject extends IfcObjectDefinition {
  objectType?: IfcLabel
  // Has inverse relationships for IsDeclaredBy, Declares, IsTypedBy, IsDefinedBy
}

/** Product (IfcProduct) - spatial or physical element */
export interface IfcProduct extends IfcObject {
  objectPlacement?: number // ref to IfcObjectPlacement
  representation?: number // ref to IfcProductRepresentation
}

// ========== Spatial Structure ==========

/** Spatial Structure Element */
export interface IfcSpatialStructureElement extends IfcProduct {
  longName?: IfcLabel
  compositionType?: 'COMPLEX' | 'ELEMENT' | 'PARTIAL'
}

/** Site */
export interface IfcSite extends IfcSpatialStructureElement {
  type: 'IfcSite'
  refLatitude?: [number, number, number, number?] // degrees, minutes, seconds, millionths
  refLongitude?: [number, number, number, number?]
  refElevation?: IfcLengthMeasure
  landTitleNumber?: IfcLabel
  siteAddress?: number // ref to IfcPostalAddress
}

/** Building */
export interface IfcBuilding extends IfcSpatialStructureElement {
  type: 'IfcBuilding'
  elevationOfRefHeight?: IfcLengthMeasure
  elevationOfTerrain?: IfcLengthMeasure
  buildingAddress?: number // ref to IfcPostalAddress
}

/** Building Storey */
export interface IfcBuildingStorey extends IfcSpatialStructureElement {
  type: 'IfcBuildingStorey'
  elevation?: IfcLengthMeasure
}

/** Space */
export interface IfcSpace extends IfcSpatialStructureElement {
  type: 'IfcSpace'
  predefinedType?: IfcSpaceTypeEnum
  elevationWithFlooring?: IfcLengthMeasure
}

export type IfcSpaceTypeEnum =
  | 'SPACE'
  | 'PARKING'
  | 'GFA'
  | 'INTERNAL'
  | 'EXTERNAL'
  | 'USERDEFINED'
  | 'NOTDEFINED'

// ========== Building Elements ==========

/** Building Element */
export interface IfcBuildingElement extends IfcProduct {
  tag?: IfcIdentifier
}

/** Wall */
export interface IfcWall extends IfcBuildingElement {
  type: 'IfcWall'
  predefinedType?: IfcWallTypeEnum
}

export type IfcWallTypeEnum =
  | 'MOVABLE'
  | 'PARAPET'
  | 'PARTITIONING'
  | 'PLUMBINGWALL'
  | 'SHEAR'
  | 'SOLIDWALL'
  | 'STANDARD'
  | 'POLYGONAL'
  | 'ELEMENTEDWALL'
  | 'RETAININGWALL'
  | 'WAVEWALL'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Slab */
export interface IfcSlab extends IfcBuildingElement {
  type: 'IfcSlab'
  predefinedType?: IfcSlabTypeEnum
}

export type IfcSlabTypeEnum =
  | 'FLOOR'
  | 'ROOF'
  | 'LANDING'
  | 'BASESLAB'
  | 'APPROACH_SLAB'
  | 'PAVING'
  | 'WEARING'
  | 'SIDEWALK'
  | 'TRACKSLAB'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Beam */
export interface IfcBeam extends IfcBuildingElement {
  type: 'IfcBeam'
  predefinedType?: IfcBeamTypeEnum
}

export type IfcBeamTypeEnum =
  | 'BEAM'
  | 'JOIST'
  | 'HOLLOWCORE'
  | 'LINTEL'
  | 'SPANDREL'
  | 'T_BEAM'
  | 'GIRDER_SEGMENT'
  | 'DIAPHRAGM'
  | 'PIERCAP'
  | 'HATSTONE'
  | 'CORNICE'
  | 'EDGEBEAM'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Column */
export interface IfcColumn extends IfcBuildingElement {
  type: 'IfcColumn'
  predefinedType?: IfcColumnTypeEnum
}

export type IfcColumnTypeEnum =
  | 'COLUMN'
  | 'PILASTER'
  | 'PIERSTEM'
  | 'PIERSTEM_SEGMENT'
  | 'STANDCOLUMN'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Door */
export interface IfcDoor extends IfcBuildingElement {
  type: 'IfcDoor'
  overallHeight?: IfcPositiveLengthMeasure
  overallWidth?: IfcPositiveLengthMeasure
  predefinedType?: IfcDoorTypeEnum
  operationType?: IfcDoorTypeOperationEnum
}

export type IfcDoorTypeEnum =
  | 'DOOR'
  | 'GATE'
  | 'TRAPDOOR'
  | 'BOOM_BARRIER'
  | 'TURNSTILE'
  | 'USERDEFINED'
  | 'NOTDEFINED'

export type IfcDoorTypeOperationEnum =
  | 'SINGLE_SWING_LEFT'
  | 'SINGLE_SWING_RIGHT'
  | 'DOUBLE_SWING_LEFT'
  | 'DOUBLE_SWING_RIGHT'
  | 'DOUBLE_DOOR_SINGLE_SWING'
  | 'DOUBLE_DOOR_DOUBLE_SWING'
  | 'SLIDING_TO_LEFT'
  | 'SLIDING_TO_RIGHT'
  | 'DOUBLE_DOOR_SLIDING'
  | 'FOLDING_TO_LEFT'
  | 'FOLDING_TO_RIGHT'
  | 'DOUBLE_DOOR_FOLDING'
  | 'REVOLVING'
  | 'ROLLINGUP'
  | 'SWING_FIXED_LEFT'
  | 'SWING_FIXED_RIGHT'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Window */
export interface IfcWindow extends IfcBuildingElement {
  type: 'IfcWindow'
  overallHeight?: IfcPositiveLengthMeasure
  overallWidth?: IfcPositiveLengthMeasure
  predefinedType?: IfcWindowTypeEnum
  partitioningType?: IfcWindowTypePartitioningEnum
}

export type IfcWindowTypeEnum =
  | 'WINDOW'
  | 'SKYLIGHT'
  | 'LIGHTDOME'
  | 'USERDEFINED'
  | 'NOTDEFINED'

export type IfcWindowTypePartitioningEnum =
  | 'SINGLE_PANEL'
  | 'DOUBLE_PANEL_VERTICAL'
  | 'DOUBLE_PANEL_HORIZONTAL'
  | 'TRIPLE_PANEL_VERTICAL'
  | 'TRIPLE_PANEL_BOTTOM'
  | 'TRIPLE_PANEL_TOP'
  | 'TRIPLE_PANEL_LEFT'
  | 'TRIPLE_PANEL_RIGHT'
  | 'TRIPLE_PANEL_HORIZONTAL'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Stair */
export interface IfcStair extends IfcBuildingElement {
  type: 'IfcStair'
  predefinedType?: IfcStairTypeEnum
}

export type IfcStairTypeEnum =
  | 'STRAIGHT_RUN_STAIR'
  | 'TWO_STRAIGHT_RUN_STAIR'
  | 'QUARTER_WINDING_STAIR'
  | 'QUARTER_TURN_STAIR'
  | 'HALF_WINDING_STAIR'
  | 'HALF_TURN_STAIR'
  | 'TWO_QUARTER_WINDING_STAIR'
  | 'TWO_QUARTER_TURN_STAIR'
  | 'THREE_QUARTER_WINDING_STAIR'
  | 'THREE_QUARTER_TURN_STAIR'
  | 'SPIRAL_STAIR'
  | 'DOUBLE_RETURN_STAIR'
  | 'CURVED_RUN_STAIR'
  | 'TWO_CURVED_RUN_STAIR'
  | 'LADDER'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Roof */
export interface IfcRoof extends IfcBuildingElement {
  type: 'IfcRoof'
  predefinedType?: IfcRoofTypeEnum
}

export type IfcRoofTypeEnum =
  | 'FLAT_ROOF'
  | 'SHED_ROOF'
  | 'GABLE_ROOF'
  | 'HIP_ROOF'
  | 'HIPPED_GABLE_ROOF'
  | 'GAMBREL_ROOF'
  | 'MANSARD_ROOF'
  | 'BARREL_ROOF'
  | 'RAINBOW_ROOF'
  | 'BUTTERFLY_ROOF'
  | 'PAVILION_ROOF'
  | 'DOME_ROOF'
  | 'FREEFORM'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Railing */
export interface IfcRailing extends IfcBuildingElement {
  type: 'IfcRailing'
  predefinedType?: IfcRailingTypeEnum
}

export type IfcRailingTypeEnum =
  | 'HANDRAIL'
  | 'GUARDRAIL'
  | 'BALUSTRADE'
  | 'FENCE'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Covering */
export interface IfcCovering extends IfcBuildingElement {
  type: 'IfcCovering'
  predefinedType?: IfcCoveringTypeEnum
}

export type IfcCoveringTypeEnum =
  | 'CEILING'
  | 'FLOORING'
  | 'CLADDING'
  | 'ROOFING'
  | 'MOLDING'
  | 'SKIRTINGBOARD'
  | 'INSULATION'
  | 'MEMBRANE'
  | 'SLEEVING'
  | 'WRAPPING'
  | 'COPING'
  | 'USERDEFINED'
  | 'NOTDEFINED'

// ========== Civil Infrastructure (IFC 4x3) ==========

/** Alignment (IFC 4x3) */
export interface IfcAlignment extends IfcProduct {
  type: 'IfcAlignment'
  predefinedType?: IfcAlignmentTypeEnum
}

export type IfcAlignmentTypeEnum =
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Facility (IFC 4x3) */
export interface IfcFacility extends IfcSpatialStructureElement {
  type: 'IfcFacility'
}

/** Bridge (IFC 4x3) */
export interface IfcBridge extends Omit<IfcFacility, 'type'> {
  type: 'IfcBridge'
  predefinedType?: IfcBridgeTypeEnum
}

export type IfcBridgeTypeEnum =
  | 'ARCHED'
  | 'CABLE_STAYED'
  | 'CANTILEVER'
  | 'CULVERT'
  | 'FRAMEWORK'
  | 'GIRDER'
  | 'SUSPENSION'
  | 'TRUSS'
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Road (IFC 4x3) */
export interface IfcRoad extends Omit<IfcFacility, 'type'> {
  type: 'IfcRoad'
  predefinedType?: IfcRoadTypeEnum
}

export type IfcRoadTypeEnum =
  | 'USERDEFINED'
  | 'NOTDEFINED'

/** Railway (IFC 4x3) */
export interface IfcRailway extends Omit<IfcFacility, 'type'> {
  type: 'IfcRailway'
  predefinedType?: IfcRailwayTypeEnum
}

export type IfcRailwayTypeEnum =
  | 'USERDEFINED'
  | 'NOTDEFINED'

// ========== Relationships ==========

/** Relationship base */
export interface IfcRelationship extends IfcRoot {
  // Base for all relationships
}

/** Relates objects to objects */
export interface IfcRelDecomposes extends IfcRelationship {
  // Base for aggregation relationships
}

/** Aggregates (IfcRelAggregates) */
export interface IfcRelAggregates extends IfcRelDecomposes {
  type: 'IfcRelAggregates'
  relatingObject: number // ref to IfcObjectDefinition
  relatedObjects: number[] // refs to IfcObjectDefinition[]
}

/** Spatial containment */
export interface IfcRelContainedInSpatialStructure extends IfcRelationship {
  type: 'IfcRelContainedInSpatialStructure'
  relatedElements: number[] // refs to IfcProduct[]
  relatingStructure: number // ref to IfcSpatialStructureElement
}

/** Assigns properties to objects */
export interface IfcRelDefinesByProperties extends IfcRelationship {
  type: 'IfcRelDefinesByProperties'
  relatedObjects: number[] // refs to IfcObjectDefinition[]
  relatingPropertyDefinition: number // ref to IfcPropertySetDefinition
}

/** Type object assignment */
export interface IfcRelDefinesByType extends IfcRelationship {
  type: 'IfcRelDefinesByType'
  relatedObjects: number[] // refs to IfcObject[]
  relatingType: number // ref to IfcTypeObject
}

/** Void in element */
export interface IfcRelVoidsElement extends IfcRelationship {
  type: 'IfcRelVoidsElement'
  relatingBuildingElement: number // ref to IfcElement
  relatedOpeningElement: number // ref to IfcOpeningElement
}

/** Fills opening */
export interface IfcRelFillsElement extends IfcRelationship {
  type: 'IfcRelFillsElement'
  relatingOpeningElement: number // ref to IfcOpeningElement
  relatedBuildingElement: number // ref to IfcElement
}

/** Connects elements */
export interface IfcRelConnectsElements extends IfcRelationship {
  type: 'IfcRelConnectsElements'
  connectionGeometry?: number // ref to IfcConnectionGeometry
  relatingElement: number // ref to IfcElement
  relatedElement: number // ref to IfcElement
}

/** Material association */
export interface IfcRelAssociatesMaterial extends IfcRelationship {
  type: 'IfcRelAssociatesMaterial'
  relatedObjects: number[] // refs to IfcDefinitionSelect[]
  relatingMaterial: number // ref to IfcMaterialSelect
}

/** Classification association */
export interface IfcRelAssociatesClassification extends IfcRelationship {
  type: 'IfcRelAssociatesClassification'
  relatedObjects: number[] // refs to IfcDefinitionSelect[]
  relatingClassification: number // ref to IfcClassificationSelect
}

// ========== Properties & Quantities ==========

/** Property Set */
export interface IfcPropertySet extends IfcRoot {
  type: 'IfcPropertySet'
  hasProperties: number[] // refs to IfcProperty[]
}

/** Single value property */
export interface IfcPropertySingleValue extends IfcEntity {
  type: 'IfcPropertySingleValue'
  name: IfcIdentifier
  description?: IfcText
  nominalValue?: IfcValue
  unit?: number // ref to IfcUnit
}

/** List value property */
export interface IfcPropertyListValue extends IfcEntity {
  type: 'IfcPropertyListValue'
  name: IfcIdentifier
  description?: IfcText
  listValues?: IfcValue[]
  unit?: number // ref to IfcUnit
}

/** Bounded value property */
export interface IfcPropertyBoundedValue extends IfcEntity {
  type: 'IfcPropertyBoundedValue'
  name: IfcIdentifier
  description?: IfcText
  upperBoundValue?: IfcValue
  lowerBoundValue?: IfcValue
  unit?: number // ref to IfcUnit
  setPointValue?: IfcValue
}

/** Enumerated value property */
export interface IfcPropertyEnumeratedValue extends IfcEntity {
  type: 'IfcPropertyEnumeratedValue'
  name: IfcIdentifier
  description?: IfcText
  enumerationValues?: IfcValue[]
  enumerationReference?: number // ref to IfcPropertyEnumeration
}

/** IFC Value types */
export type IfcValue =
  | { type: 'IfcLabel'; value: string }
  | { type: 'IfcText'; value: string }
  | { type: 'IfcIdentifier'; value: string }
  | { type: 'IfcBoolean'; value: boolean }
  | { type: 'IfcLogical'; value: IfcLogical }
  | { type: 'IfcInteger'; value: number }
  | { type: 'IfcReal'; value: number }
  | { type: 'IfcLengthMeasure'; value: number }
  | { type: 'IfcAreaMeasure'; value: number }
  | { type: 'IfcVolumeMeasure'; value: number }
  | { type: 'IfcPositiveLengthMeasure'; value: number }
  | { type: 'IfcPlaneAngleMeasure'; value: number }
  | { type: 'IfcCountMeasure'; value: number }
  | { type: 'IfcMassMeasure'; value: number }
  | { type: 'IfcTimeMeasure'; value: number }
  | { type: 'IfcMonetaryMeasure'; value: number }

/** Element Quantity */
export interface IfcElementQuantity extends IfcRoot {
  type: 'IfcElementQuantity'
  methodOfMeasurement?: IfcLabel
  quantities: number[] // refs to IfcPhysicalQuantity[]
}

/** Physical quantity base */
export interface IfcPhysicalQuantity extends IfcEntity {
  name: IfcLabel
  description?: IfcText
}

/** Length quantity */
export interface IfcQuantityLength extends IfcPhysicalQuantity {
  type: 'IfcQuantityLength'
  lengthValue: IfcLengthMeasure
  formula?: IfcLabel
}

/** Area quantity */
export interface IfcQuantityArea extends IfcPhysicalQuantity {
  type: 'IfcQuantityArea'
  areaValue: IfcAreaMeasure
  formula?: IfcLabel
}

/** Volume quantity */
export interface IfcQuantityVolume extends IfcPhysicalQuantity {
  type: 'IfcQuantityVolume'
  volumeValue: IfcVolumeMeasure
  formula?: IfcLabel
}

/** Count quantity */
export interface IfcQuantityCount extends IfcPhysicalQuantity {
  type: 'IfcQuantityCount'
  countValue: IfcInteger
  formula?: IfcLabel
}

// ========== Materials ==========

/** Material */
export interface IfcMaterial extends IfcEntity {
  type: 'IfcMaterial'
  name: IfcLabel
  description?: IfcText
  category?: IfcLabel
}

/** Material Layer */
export interface IfcMaterialLayer extends IfcEntity {
  type: 'IfcMaterialLayer'
  material?: number // ref to IfcMaterial
  layerThickness: IfcPositiveLengthMeasure
  isVentilated?: IfcLogical
  name?: IfcLabel
  description?: IfcText
  category?: IfcLabel
  priority?: IfcInteger
}

/** Material Layer Set */
export interface IfcMaterialLayerSet extends IfcEntity {
  type: 'IfcMaterialLayerSet'
  materialLayers: number[] // refs to IfcMaterialLayer[]
  layerSetName?: IfcLabel
  description?: IfcText
}

// ========== Geometry ==========

/** Cartesian Point */
export interface IfcCartesianPoint extends IfcEntity {
  type: 'IfcCartesianPoint'
  coordinates: [number, number] | [number, number, number]
}

/** Direction */
export interface IfcDirection extends IfcEntity {
  type: 'IfcDirection'
  directionRatios: [number, number] | [number, number, number]
}

/** Axis2 Placement 3D */
export interface IfcAxis2Placement3D extends IfcEntity {
  type: 'IfcAxis2Placement3D'
  location: number // ref to IfcCartesianPoint
  axis?: number // ref to IfcDirection
  refDirection?: number // ref to IfcDirection
}

/** Local Placement */
export interface IfcLocalPlacement extends IfcEntity {
  type: 'IfcLocalPlacement'
  placementRelTo?: number // ref to IfcObjectPlacement
  relativePlacement: number // ref to IfcAxis2Placement
}

/** Shape Representation */
export interface IfcShapeRepresentation extends IfcEntity {
  type: 'IfcShapeRepresentation'
  contextOfItems: number // ref to IfcRepresentationContext
  representationIdentifier?: IfcLabel
  representationType?: IfcLabel
  items: number[] // refs to IfcRepresentationItem[]
}

/** Product Definition Shape */
export interface IfcProductDefinitionShape extends IfcEntity {
  type: 'IfcProductDefinitionShape'
  name?: IfcLabel
  description?: IfcText
  representations: number[] // refs to IfcRepresentation[]
}

// ========== Parsed IFC Model ==========

/** Complete parsed IFC model */
export interface IfcModel {
  schema: string // e.g., 'IFC4X3'
  header: IfcFileHeader
  entities: Map<number, IfcEntity>
  byType: Map<string, number[]>
  project?: IfcProject
  sites: IfcSite[]
  buildings: IfcBuilding[]
  storeys: IfcBuildingStorey[]
  spaces: IfcSpace[]
  elements: IfcBuildingElement[]
  relationships: IfcRelationship[]
  propertySets: IfcPropertySet[]
  materials: IfcMaterial[]
}

/** IFC File Header */
export interface IfcFileHeader {
  fileDescription?: {
    description: string[]
    implementationLevel: string
  }
  fileName?: {
    name: string
    timeStamp: string
    author: string[]
    organization: string[]
    preprocessorVersion: string
    originatingSystem: string
    authorization: string
  }
  fileSchema?: {
    schemas: string[]
  }
}

/** IFC Project */
export interface IfcProject extends IfcRoot {
  type: 'IfcProject'
  objectType?: IfcLabel
  longName?: IfcLabel
  phase?: IfcLabel
  representationContexts?: number[]
  unitsInContext?: number // ref to IfcUnitAssignment
}

// ========== Helper Types ==========

/** Spatial hierarchy node */
export interface SpatialHierarchyNode {
  entity: IfcSpatialStructureElement
  children: SpatialHierarchyNode[]
  elements: IfcProduct[]
}

/** Element summary */
export interface ElementSummary {
  type: string
  count: number
  items: {
    id: number
    globalId: string
    name?: string
    predefinedType?: string
  }[]
}

/** Property summary */
export interface PropertySummary {
  psetName: string
  properties: {
    name: string
    value: unknown
    type: string
  }[]
}

/** Relationship summary */
export interface RelationshipSummary {
  type: string
  count: number
  connections: {
    from: { id: number; type: string; name?: string }
    to: { id: number; type: string; name?: string }
  }[]
}

// ========== IFC Class Categories ==========

export const IFC_ELEMENT_CLASSES = [
  'IfcWall',
  'IfcWallStandardCase',
  'IfcSlab',
  'IfcBeam',
  'IfcColumn',
  'IfcDoor',
  'IfcWindow',
  'IfcStair',
  'IfcStairFlight',
  'IfcRoof',
  'IfcRailing',
  'IfcCovering',
  'IfcCurtainWall',
  'IfcPlate',
  'IfcMember',
  'IfcFooting',
  'IfcPile',
  'IfcRamp',
  'IfcRampFlight',
] as const

export const IFC_SPATIAL_CLASSES = [
  'IfcProject',
  'IfcSite',
  'IfcBuilding',
  'IfcBuildingStorey',
  'IfcSpace',
  'IfcFacility',
  'IfcBridge',
  'IfcRoad',
  'IfcRailway',
] as const

export const IFC_RELATIONSHIP_CLASSES = [
  'IfcRelAggregates',
  'IfcRelContainedInSpatialStructure',
  'IfcRelDefinesByProperties',
  'IfcRelDefinesByType',
  'IfcRelVoidsElement',
  'IfcRelFillsElement',
  'IfcRelConnectsElements',
  'IfcRelAssociatesMaterial',
  'IfcRelAssociatesClassification',
] as const

export type IfcElementClass = (typeof IFC_ELEMENT_CLASSES)[number]
export type IfcSpatialClass = (typeof IFC_SPATIAL_CLASSES)[number]
export type IfcRelationshipClass = (typeof IFC_RELATIONSHIP_CLASSES)[number]
