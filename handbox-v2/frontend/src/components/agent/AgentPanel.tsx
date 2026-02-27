/**
 * AgentPanel — UI for monitoring and managing multi-agent orchestration.
 *
 * Features:
 * - Agent list with status indicators
 * - Task queue visualization
 * - Real-time event log
 * - Performance metrics
 * - Agent configuration
 */

import { useState, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useAgentStore,
} from '@/stores/agentStore'
import type { AgentInstance, AgentDef, AgentTask } from '@/types/agent'
import {
  Play,
  Pause,
  Users,
  Cpu,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Settings,
  Zap,
  LayoutGrid,
  List,
  Timer,
  RefreshCw,
  Plus,
  Trash2,
} from 'lucide-react'

type TabType = 'agents' | 'tasks' | 'events' | 'config'

export function AgentPanel() {
  const [activeTab, setActiveTab] = useState<TabType>('agents')

  const {
    isOrchestratorRunning,
    startOrchestrator,
    stopOrchestrator,
    viewMode,
    setViewMode,
  } = useAgentStore()

  // Use shallow comparison to prevent infinite re-renders from object reference changes
  const { instances, tasks } = useAgentStore(
    useShallow((state) => ({ instances: state.instances, tasks: state.tasks }))
  )

  // Compute stats locally with useMemo to avoid selector creating new objects every render
  const stats = useMemo(() => {
    const instanceList = Object.values(instances)
    const taskList = Object.values(tasks)

    return {
      totalAgents: instanceList.length,
      activeAgents: instanceList.filter(a => a.status !== 'offline').length,
      idleAgents: instanceList.filter(a => a.status === 'idle').length,
      busyAgents: instanceList.filter(a => a.status === 'busy').length,
      totalTasks: taskList.length,
      pendingTasks: taskList.filter(t => t.status === 'pending' || t.status === 'queued').length,
      runningTasks: taskList.filter(t => t.status === 'running').length,
      completedTasks: taskList.filter(t => t.status === 'completed').length,
      failedTasks: taskList.filter(t => t.status === 'failed').length,
    }
  }, [instances, tasks])

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-3">
          <Users size={18} className="text-violet-400" />
          <span className="font-semibold">Agent Orchestrator</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full ${
            isOrchestratorRunning
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-neutral-700 text-neutral-400'
          }`}>
            {isOrchestratorRunning ? 'Running' : 'Stopped'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-neutral-800 rounded p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-neutral-700' : 'hover:bg-neutral-700/50'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-neutral-700' : 'hover:bg-neutral-700/50'}`}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`p-1.5 rounded ${viewMode === 'timeline' ? 'bg-neutral-700' : 'hover:bg-neutral-700/50'}`}
            >
              <Timer size={14} />
            </button>
          </div>

          {/* Start/Stop button */}
          <button
            onClick={isOrchestratorRunning ? stopOrchestrator : startOrchestrator}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded ${
              isOrchestratorRunning
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isOrchestratorRunning ? <Pause size={12} /> : <Play size={12} />}
            {isOrchestratorRunning ? 'Stop' : 'Start'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-2 px-4 py-2 border-b border-neutral-800 bg-neutral-850">
        <StatCard icon={Users} label="Agents" value={`${stats.activeAgents}/${stats.totalAgents}`} />
        <StatCard icon={Activity} label="Running" value={stats.runningTasks} color="blue" />
        <StatCard icon={CheckCircle} label="Completed" value={stats.completedTasks} color="green" />
        <StatCard icon={XCircle} label="Failed" value={stats.failedTasks} color="red" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-800">
        {(['agents', 'tasks', 'events', 'config'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {tab === 'agents' && <Cpu size={12} />}
            {tab === 'tasks' && <Zap size={12} />}
            {tab === 'events' && <Activity size={12} />}
            {tab === 'config' && <Settings size={12} />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'agents' && <AgentsTab />}
        {activeTab === 'tasks' && <TasksTab />}
        {activeTab === 'events' && <EventsTab />}
        {activeTab === 'config' && <ConfigTab />}
      </div>
    </div>
  )
}

// ========== Components ==========

function StatCard({
  icon: Icon,
  label,
  value,
  color = 'neutral',
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number | string
  color?: 'neutral' | 'blue' | 'green' | 'red'
}) {
  const colorClasses = {
    neutral: 'text-neutral-400',
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    red: 'text-red-400',
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800/50 rounded">
      <Icon size={14} className={colorClasses[color]} />
      <div>
        <div className="text-[10px] text-neutral-500">{label}</div>
        <div className={`text-sm font-semibold ${colorClasses[color]}`}>{value}</div>
      </div>
    </div>
  )
}

// ========== Agents Tab ==========

function AgentsTab() {
  const { instances, definitions, viewMode, selectedAgentId, selectAgent } = useAgentStore()
  const agents = Object.values(instances)

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {agents.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            def={definitions[agent.defId]}
            isSelected={selectedAgentId === agent.id}
            onClick={() => selectAgent(agent.id)}
          />
        ))}
        <AddAgentCard />
      </div>
    )
  }

  return (
    <div className="divide-y divide-neutral-800">
      {agents.map(agent => (
        <AgentRow
          key={agent.id}
          agent={agent}
          def={definitions[agent.defId]}
          isSelected={selectedAgentId === agent.id}
          onClick={() => selectAgent(agent.id)}
        />
      ))}
    </div>
  )
}

function AgentCard({
  agent,
  def,
  isSelected,
  onClick,
}: {
  agent: AgentInstance
  def?: AgentDef
  isSelected: boolean
  onClick: () => void
}) {
  const statusColors: Record<AgentInstance['status'], string> = {
    idle: 'bg-neutral-500',
    busy: 'bg-blue-500',
    waiting: 'bg-yellow-500',
    error: 'bg-red-500',
    offline: 'bg-neutral-700',
  }

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
        isSelected
          ? 'border-violet-500 bg-violet-500/10'
          : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
          <span className="text-sm font-medium">{def?.name ?? 'Unknown'}</span>
        </div>
        <span className="text-[10px] text-neutral-500 bg-neutral-700 px-1.5 py-0.5 rounded">
          {def?.role}
        </span>
      </div>

      <div className="text-[10px] text-neutral-500 mb-2 line-clamp-2">
        {def?.description}
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <span className="text-neutral-400">
          Queue: {agent.taskQueue.length}
        </span>
        <span className="text-neutral-400">
          {(agent.metrics.successRate * 100).toFixed(0)}% success
        </span>
      </div>

      {agent.taskQueue.length > 0 && (
        <div className="mt-2 h-1 bg-neutral-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500"
            style={{ width: `${Math.min(100, agent.taskQueue.length * 20)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function AgentRow({
  agent,
  def,
  isSelected,
  onClick,
}: {
  agent: AgentInstance
  def?: AgentDef
  isSelected: boolean
  onClick: () => void
}) {
  const statusColors: Record<AgentInstance['status'], string> = {
    idle: 'bg-neutral-500',
    busy: 'bg-blue-500',
    waiting: 'bg-yellow-500',
    error: 'bg-red-500',
    offline: 'bg-neutral-700',
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${
        isSelected ? 'bg-violet-500/10' : 'hover:bg-neutral-800/50'
      }`}
    >
      <div className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{def?.name}</span>
          <span className="text-[10px] text-neutral-500">{def?.role}</span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-neutral-400">
        <span>Queue: {agent.taskQueue.length}</span>
        <span>{agent.metrics.tasksCompleted} completed</span>
        <ChevronRight size={14} />
      </div>
    </div>
  )
}

function AddAgentCard() {
  return (
    <button className="flex flex-col items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-neutral-700 text-neutral-500 hover:border-neutral-600 hover:text-neutral-400 transition-colors">
      <Plus size={20} />
      <span className="text-xs">Add Agent</span>
    </button>
  )
}

// ========== Tasks Tab ==========

function TasksTab() {
  const { tasks } = useAgentStore()
  const allTasks = Object.values(tasks).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  const pendingTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'queued')
  const runningTasks = allTasks.filter(t => t.status === 'running')
  const completedTasks = allTasks.filter(t => t.status === 'completed' || t.status === 'failed')

  return (
    <div className="p-4 space-y-4">
      {/* Running */}
      {runningTasks.length > 0 && (
        <TaskSection title="Running" tasks={runningTasks} color="blue" />
      )}

      {/* Pending */}
      {pendingTasks.length > 0 && (
        <TaskSection title="Pending" tasks={pendingTasks} color="yellow" />
      )}

      {/* Completed */}
      <TaskSection title="History" tasks={completedTasks.slice(0, 20)} color="neutral" />
    </div>
  )
}

function TaskSection({
  title,
  tasks,
  color,
}: {
  title: string
  tasks: AgentTask[]
  color: 'blue' | 'yellow' | 'neutral'
}) {
  const colorClasses = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    neutral: 'border-neutral-700 bg-neutral-800/30',
  }

  return (
    <div>
      <h3 className="text-xs font-medium text-neutral-500 mb-2">
        {title} ({tasks.length})
      </h3>
      <div className={`rounded-lg border ${colorClasses[color]} divide-y divide-neutral-800`}>
        {tasks.length === 0 ? (
          <div className="px-4 py-3 text-xs text-neutral-500">No tasks</div>
        ) : (
          tasks.map(task => <TaskRow key={task.id} task={task} />)
        )}
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: AgentTask }) {
  const statusIcons: Record<AgentTask['status'], React.ReactNode> = {
    pending: <Clock size={12} className="text-neutral-400" />,
    queued: <Clock size={12} className="text-yellow-400" />,
    running: <RefreshCw size={12} className="text-blue-400 animate-spin" />,
    completed: <CheckCircle size={12} className="text-emerald-400" />,
    failed: <XCircle size={12} className="text-red-400" />,
    cancelled: <XCircle size={12} className="text-neutral-400" />,
    timeout: <AlertCircle size={12} className="text-orange-400" />,
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {statusIcons[task.status]}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">
          {task.type}: {task.id.slice(0, 8)}
        </div>
        <div className="text-[10px] text-neutral-500">
          Priority: {task.priority} | Retries: {task.retryCount}/{task.maxRetries}
        </div>
      </div>
      <div className="text-[10px] text-neutral-500">
        {new Date(task.createdAt).toLocaleTimeString()}
      </div>
    </div>
  )
}

// ========== Events Tab ==========

function EventsTab() {
  const { events } = useAgentStore()
  const sortedEvents = [...events].reverse()

  const eventIcons: Record<string, React.ReactNode> = {
    agent_registered: <Plus size={12} className="text-emerald-400" />,
    agent_unregistered: <Trash2 size={12} className="text-red-400" />,
    agent_status_changed: <Activity size={12} className="text-blue-400" />,
    task_created: <Zap size={12} className="text-violet-400" />,
    task_assigned: <ChevronRight size={12} className="text-blue-400" />,
    task_started: <Play size={12} className="text-emerald-400" />,
    task_completed: <CheckCircle size={12} className="text-emerald-400" />,
    task_failed: <XCircle size={12} className="text-red-400" />,
    task_timeout: <AlertCircle size={12} className="text-orange-400" />,
    task_retried: <RefreshCw size={12} className="text-yellow-400" />,
    load_rebalanced: <Activity size={12} className="text-violet-400" />,
    health_check: <Activity size={12} className="text-neutral-400" />,
  }

  return (
    <div className="divide-y divide-neutral-800">
      {sortedEvents.length === 0 ? (
        <div className="px-4 py-8 text-center text-neutral-500 text-sm">
          No events yet. Start the orchestrator to see activity.
        </div>
      ) : (
        sortedEvents.map(event => (
          <div key={event.id} className="flex items-start gap-3 px-4 py-2">
            <div className="pt-0.5">
              {eventIcons[event.type] || <Activity size={12} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">
                {event.type.replace(/_/g, ' ')}
              </div>
              <div className="text-[10px] text-neutral-500">
                {event.agentId && `Agent: ${event.agentId.slice(0, 12)}... `}
                {event.taskId && `Task: ${event.taskId.slice(0, 8)}...`}
              </div>
            </div>
            <div className="text-[10px] text-neutral-600">
              {new Date(event.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ========== Config Tab ==========

function ConfigTab() {
  const { config, updateConfig } = useAgentStore()

  return (
    <div className="p-4 space-y-4">
      {/* Strategy */}
      <div>
        <label className="block text-xs font-medium text-neutral-400 mb-1">
          Orchestration Strategy
        </label>
        <select
          value={config.strategy}
          onChange={(e) => updateConfig({ strategy: e.target.value as any })}
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm"
        >
          <option value="round_robin">Round Robin</option>
          <option value="least_busy">Least Busy</option>
          <option value="capability_match">Capability Match</option>
          <option value="priority_based">Priority Based</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      {/* Max Concurrent Tasks */}
      <div>
        <label className="block text-xs font-medium text-neutral-400 mb-1">
          Max Concurrent Tasks
        </label>
        <input
          type="number"
          value={config.maxConcurrentTasks}
          onChange={(e) => updateConfig({ maxConcurrentTasks: parseInt(e.target.value) })}
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm"
        />
      </div>

      {/* Task Timeout */}
      <div>
        <label className="block text-xs font-medium text-neutral-400 mb-1">
          Task Timeout (ms)
        </label>
        <input
          type="number"
          value={config.taskTimeout}
          onChange={(e) => updateConfig({ taskTimeout: parseInt(e.target.value) })}
          className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm"
        />
      </div>

      {/* Retry Policy */}
      <div className="border border-neutral-700 rounded-lg p-3">
        <h4 className="text-xs font-medium text-neutral-300 mb-2">Retry Policy</h4>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-neutral-500 mb-1">Max Retries</label>
            <input
              type="number"
              value={config.retryPolicy.maxRetries}
              onChange={(e) => updateConfig({
                retryPolicy: { ...config.retryPolicy, maxRetries: parseInt(e.target.value) }
              })}
              className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-500 mb-1">Initial Delay</label>
            <input
              type="number"
              value={config.retryPolicy.initialDelay}
              onChange={(e) => updateConfig({
                retryPolicy: { ...config.retryPolicy, initialDelay: parseInt(e.target.value) }
              })}
              className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-500 mb-1">Backoff</label>
            <input
              type="number"
              value={config.retryPolicy.backoffMultiplier}
              onChange={(e) => updateConfig({
                retryPolicy: { ...config.retryPolicy, backoffMultiplier: parseFloat(e.target.value) }
              })}
              className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs"
            />
          </div>
        </div>
      </div>

      {/* Load Balancing */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-neutral-300">Load Balancing</div>
          <div className="text-[10px] text-neutral-500">Auto-balance task distribution</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.loadBalancing.enabled}
            onChange={(e) => updateConfig({
              loadBalancing: { ...config.loadBalancing, enabled: e.target.checked }
            })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600" />
        </label>
      </div>

      {/* Health Check */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium text-neutral-300">Health Check</div>
          <div className="text-[10px] text-neutral-500">Monitor agent health</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.healthCheck.enabled}
            onChange={(e) => updateConfig({
              healthCheck: { ...config.healthCheck, enabled: e.target.checked }
            })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600" />
        </label>
      </div>
    </div>
  )
}

export default AgentPanel
