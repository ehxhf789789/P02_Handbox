/**
 * Icon Map — 아이콘 이름(string) → React 컴포넌트 매핑
 *
 * NodeDefinition.meta.icon 문자열을 실제 MUI 아이콘으로 변환.
 * NodePalette, GenericNode, PropertyPanel 등에서 공용으로 사용.
 */

import React from 'react'

// MUI Icons
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import TransformIcon from '@mui/icons-material/Transform'
import ContentCutIcon from '@mui/icons-material/ContentCut'
import TextFieldsIcon from '@mui/icons-material/TextFields'
import EditIcon from '@mui/icons-material/Edit'
import PsychologyIcon from '@mui/icons-material/Psychology'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import LayersIcon from '@mui/icons-material/Layers'
import StorageIcon from '@mui/icons-material/Storage'
import SearchIcon from '@mui/icons-material/Search'
import DataObjectIcon from '@mui/icons-material/DataObject'
import HubIcon from '@mui/icons-material/Hub'
import MergeTypeIcon from '@mui/icons-material/MergeType'
import CallSplitIcon from '@mui/icons-material/CallSplit'
import TableChartIcon from '@mui/icons-material/TableChart'
import DownloadIcon from '@mui/icons-material/Download'
import VisibilityIcon from '@mui/icons-material/Visibility'
import BarChartIcon from '@mui/icons-material/BarChart'
import CloudIcon from '@mui/icons-material/Cloud'
import ApiIcon from '@mui/icons-material/Api'
import ExtensionIcon from '@mui/icons-material/Extension'
import InputIcon from '@mui/icons-material/Input'
import OutputIcon from '@mui/icons-material/Output'
import DescriptionIcon from '@mui/icons-material/Description'
import ArticleIcon from '@mui/icons-material/Article'
import AssessmentIcon from '@mui/icons-material/Assessment'
import PreviewIcon from '@mui/icons-material/Preview'
import DashboardIcon from '@mui/icons-material/Dashboard'
import WebhookIcon from '@mui/icons-material/Webhook'
import ScienceIcon from '@mui/icons-material/Science'
import TerminalIcon from '@mui/icons-material/Terminal'
import CodeIcon from '@mui/icons-material/Code'

const ICON_MAP: Record<string, React.ComponentType<{ sx?: any }>> = {
  FolderOpen: FolderOpenIcon,
  InsertDriveFile: InsertDriveFileIcon,
  PictureAsPdf: PictureAsPdfIcon,
  Transform: TransformIcon,
  ContentCut: ContentCutIcon,
  TextFields: TextFieldsIcon,
  Edit: EditIcon,
  Psychology: PsychologyIcon,
  SmartToy: SmartToyIcon,
  Layers: LayersIcon,
  Storage: StorageIcon,
  Search: SearchIcon,
  DataObject: DataObjectIcon,
  Hub: HubIcon,
  MergeType: MergeTypeIcon,
  CallSplit: CallSplitIcon,
  TableChart: TableChartIcon,
  Download: DownloadIcon,
  Visibility: VisibilityIcon,
  BarChart: BarChartIcon,
  Cloud: CloudIcon,
  Api: ApiIcon,
  Extension: ExtensionIcon,
  Input: InputIcon,
  Output: OutputIcon,
  Description: DescriptionIcon,
  Article: ArticleIcon,
  Assessment: AssessmentIcon,
  Preview: PreviewIcon,
  Dashboard: DashboardIcon,
  Webhook: WebhookIcon,
  Science: ScienceIcon,
  Terminal: TerminalIcon,
  Code: CodeIcon,
}

/**
 * 아이콘 이름으로 React 엘리먼트 반환
 * @param name MUI 아이콘 이름 (e.g., 'PictureAsPdf')
 * @param props sx 등 추가 props
 */
export function getIcon(name: string, sx?: Record<string, any>): React.ReactElement {
  const IconComponent = ICON_MAP[name]
  if (IconComponent) {
    return <IconComponent sx={sx} />
  }
  return <DashboardIcon sx={sx} />
}

/**
 * 아이콘 컴포넌트 반환 (렌더 최적화용)
 */
export function getIconComponent(name: string): React.ComponentType<{ sx?: any }> {
  return ICON_MAP[name] || DashboardIcon
}

export { ICON_MAP }
