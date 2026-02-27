/**
 * WorkflowMarketplace — Browse, search, and download shared workflows.
 */

import { useState, useEffect } from 'react'
import { useMarketplaceStore, selectIsLiked, selectIsDownloaded } from '@/stores/marketplaceStore'
import type { MarketplaceWorkflow, WorkflowCategory } from '@/types/marketplace'
import {
  Search,
  Download,
  Heart,
  Star,
  Filter,
  LayoutGrid,
  List,
  ChevronRight,
  CheckCircle,
  Shield,
  Award,
  X,
  ExternalLink,
  Clock,
  Boxes,
} from 'lucide-react'

export function WorkflowMarketplace() {
  const {
    filters,
    setFilters,
    search,
    searchResults,
    isSearching,
    featuredWorkflows,
    categories,
    viewMode,
    setViewMode,
    selectedWorkflow,
    detailOpen,
    openDetail,
    closeDetail,
    loadFeatured,
  } = useMarketplaceStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    loadFeatured()
  }, [loadFeatured])

  const handleSearch = () => {
    setFilters({ query: searchQuery, page: 1 })
    search()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const displayWorkflows = searchResults?.workflows ?? featuredWorkflows

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-neutral-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Workflow Marketplace</h1>
            <p className="text-sm text-neutral-500">Discover and share workflows</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search workflows..."
              className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg
                       text-sm focus:outline-none focus:border-violet-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-lg border transition-colors ${
              showFilters
                ? 'bg-violet-600 border-violet-500'
                : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
            }`}
          >
            <Filter size={16} />
          </button>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium"
          >
            Search
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-neutral-800 rounded-lg">
            <div className="grid grid-cols-3 gap-4">
              {/* Category */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Category</label>
                <select
                  value={filters.category || ''}
                  onChange={(e) => setFilters({ category: e.target.value as WorkflowCategory || undefined })}
                  className="w-full px-3 py-1.5 bg-neutral-700 border border-neutral-600 rounded text-sm"
                >
                  <option value="">All Categories</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name} ({cat.count})</option>
                  ))}
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters({ sortBy: e.target.value as 'popular' | 'recent' | 'rating' | 'downloads' })}
                  className="w-full px-3 py-1.5 bg-neutral-700 border border-neutral-600 rounded text-sm"
                >
                  <option value="popular">Most Popular</option>
                  <option value="recent">Most Recent</option>
                  <option value="rating">Highest Rated</option>
                  <option value="downloads">Most Downloads</option>
                </select>
              </div>

              {/* Rating */}
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Min Rating</label>
                <select
                  value={filters.minRating || ''}
                  onChange={(e) => setFilters({ minRating: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-3 py-1.5 bg-neutral-700 border border-neutral-600 rounded text-sm"
                >
                  <option value="">Any</option>
                  <option value="4.5">4.5+</option>
                  <option value="4">4.0+</option>
                  <option value="3.5">3.5+</option>
                  <option value="3">3.0+</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Categories Quick Filter */}
      <div className="px-6 py-3 border-b border-neutral-800 flex gap-2 overflow-x-auto">
        {categories.slice(0, 6).map(cat => (
          <button
            key={cat.id}
            onClick={() => {
              setFilters({ category: filters.category === cat.id ? undefined : cat.id })
              search()
            }}
            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
              filters.category === cat.id
                ? 'bg-violet-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {isSearching ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {displayWorkflows.map(workflow => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onClick={() => openDetail(workflow)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {displayWorkflows.map(workflow => (
              <WorkflowListItem
                key={workflow.id}
                workflow={workflow}
                onClick={() => openDetail(workflow)}
              />
            ))}
          </div>
        )}

        {displayWorkflows.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center h-64 text-neutral-500">
            <Search size={48} className="mb-4 opacity-50" />
            <p>No workflows found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {detailOpen && selectedWorkflow && (
        <WorkflowDetailModal workflow={selectedWorkflow} onClose={closeDetail} />
      )}
    </div>
  )
}

// ========== Components ==========

function WorkflowCard({
  workflow,
  onClick,
}: {
  workflow: MarketplaceWorkflow
  onClick: () => void
}) {
  const isLiked = useMarketplaceStore(state => selectIsLiked(state, workflow.id))
  const isDownloaded = useMarketplaceStore(state => selectIsDownloaded(state, workflow.id))

  return (
    <div
      onClick={onClick}
      className="p-4 bg-neutral-800/50 border border-neutral-700 rounded-lg cursor-pointer
                hover:border-violet-500/50 hover:bg-neutral-800 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {workflow.isOfficial && (
              <Shield size={12} className="text-violet-400" />
            )}
            {workflow.isVerified && (
              <CheckCircle size={12} className="text-emerald-400" />
            )}
            {workflow.isFeatured && (
              <Award size={12} className="text-yellow-400" />
            )}
          </div>
          <h3 className="text-sm font-semibold truncate">{workflow.name}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-neutral-400 line-clamp-2 mb-3">
        {workflow.description}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {workflow.tags.slice(0, 3).map(tag => (
          <span
            key={tag}
            className="px-1.5 py-0.5 text-[10px] bg-neutral-700 rounded text-neutral-400"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-[10px] text-neutral-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Star size={10} className="text-yellow-400" />
            {workflow.rating.toFixed(1)}
          </span>
          <span className="flex items-center gap-1">
            <Download size={10} />
            {workflow.downloads.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Heart size={10} className={isLiked ? 'text-red-400 fill-red-400' : ''} />
            {workflow.likes}
          </span>
        </div>
        {isDownloaded && (
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle size={10} />
            Installed
          </span>
        )}
      </div>

      {/* Author */}
      <div className="mt-3 pt-3 border-t border-neutral-700 flex items-center gap-2">
        <div className="w-5 h-5 bg-neutral-700 rounded-full flex items-center justify-center text-[10px]">
          {workflow.author.name[0]}
        </div>
        <span className="text-xs text-neutral-400">{workflow.author.name}</span>
        {workflow.author.isVerified && (
          <CheckCircle size={10} className="text-blue-400" />
        )}
      </div>
    </div>
  )
}

function WorkflowListItem({
  workflow,
  onClick,
}: {
  workflow: MarketplaceWorkflow
  onClick: () => void
}) {
  const isLiked = useMarketplaceStore(state => selectIsLiked(state, workflow.id))
  const isDownloaded = useMarketplaceStore(state => selectIsDownloaded(state, workflow.id))

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 p-3 bg-neutral-800/50 border border-neutral-700 rounded-lg
                cursor-pointer hover:border-violet-500/50 transition-colors"
    >
      {/* Icon */}
      <div className="w-12 h-12 bg-neutral-700 rounded-lg flex items-center justify-center">
        <Boxes size={20} className="text-violet-400" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold truncate">{workflow.name}</h3>
          {workflow.isOfficial && <Shield size={12} className="text-violet-400" />}
          {workflow.isVerified && <CheckCircle size={12} className="text-emerald-400" />}
        </div>
        <p className="text-xs text-neutral-400 truncate">{workflow.description}</p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-neutral-500">
        <span className="flex items-center gap-1">
          <Star size={12} className="text-yellow-400" />
          {workflow.rating.toFixed(1)}
        </span>
        <span className="flex items-center gap-1">
          <Download size={12} />
          {workflow.downloads.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <Heart size={12} className={isLiked ? 'text-red-400 fill-red-400' : ''} />
          {workflow.likes}
        </span>
      </div>

      {isDownloaded && (
        <span className="text-emerald-400 text-xs flex items-center gap-1">
          <CheckCircle size={12} />
        </span>
      )}

      <ChevronRight size={16} className="text-neutral-600" />
    </div>
  )
}

function WorkflowDetailModal({
  workflow,
  onClose,
}: {
  workflow: MarketplaceWorkflow
  onClose: () => void
}) {
  const { downloadWorkflow, likeWorkflow, unlikeWorkflow, selectedWorkflowReviews } = useMarketplaceStore()
  const isLiked = useMarketplaceStore(state => selectIsLiked(state, workflow.id))
  const isDownloaded = useMarketplaceStore(state => selectIsDownloaded(state, workflow.id))
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    await downloadWorkflow(workflow.id)
    setIsDownloading(false)
  }

  const handleLikeToggle = () => {
    if (isLiked) {
      unlikeWorkflow(workflow.id)
    } else {
      likeWorkflow(workflow.id)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl max-h-[90vh] bg-neutral-900 rounded-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold">{workflow.name}</h2>
              {workflow.isOfficial && <Shield size={16} className="text-violet-400" />}
              {workflow.isVerified && <CheckCircle size={16} className="text-emerald-400" />}
            </div>
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span>by {workflow.author.name}</span>
              <span>•</span>
              <span>v{workflow.version}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Stats Row */}
          <div className="flex items-center gap-6 mb-6">
            <div className="flex items-center gap-1.5">
              <Star size={16} className="text-yellow-400" />
              <span className="font-semibold">{workflow.rating.toFixed(1)}</span>
              <span className="text-sm text-neutral-500">({workflow.ratingCount} reviews)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Download size={16} className="text-neutral-400" />
              <span>{workflow.downloads.toLocaleString()} downloads</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Heart size={16} className="text-neutral-400" />
              <span>{workflow.likes} likes</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-neutral-300 mb-6">{workflow.description}</p>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-500 mb-1">Nodes</div>
              <div className="flex items-center gap-2">
                <Boxes size={16} className="text-violet-400" />
                <span>{workflow.nodeCount} nodes</span>
              </div>
            </div>
            <div className="p-3 bg-neutral-800 rounded-lg">
              <div className="text-xs text-neutral-500 mb-1">Runtime</div>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-blue-400" />
                <span>~{workflow.estimatedRuntime}</span>
              </div>
            </div>
          </div>

          {/* Required Tools */}
          {workflow.requiredTools.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium mb-2">Required Tools</h3>
              <div className="flex flex-wrap gap-2">
                {workflow.requiredTools.map(tool => (
                  <span key={tool} className="px-2 py-1 text-xs bg-neutral-800 rounded">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="mb-6">
            <h3 className="text-sm font-medium mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {workflow.tags.map(tag => (
                <span key={tag} className="px-2 py-1 text-xs bg-violet-600/20 text-violet-400 rounded">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Reviews */}
          <div>
            <h3 className="text-sm font-medium mb-3">Reviews</h3>
            {selectedWorkflowReviews.length > 0 ? (
              <div className="space-y-3">
                {selectedWorkflowReviews.map(review => (
                  <div key={review.id} className="p-3 bg-neutral-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-neutral-700 rounded-full flex items-center justify-center text-xs">
                          {review.author.name[0]}
                        </div>
                        <span className="text-sm font-medium">{review.author.name}</span>
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={10}
                              className={i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-neutral-600'}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="text-xs text-neutral-500">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-300">{review.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No reviews yet</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 flex items-center justify-between">
          <button
            onClick={handleLikeToggle}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isLiked
                ? 'bg-red-600/20 text-red-400'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }`}
          >
            <Heart size={16} className={isLiked ? 'fill-current' : ''} />
            {isLiked ? 'Liked' : 'Like'}
          </button>

          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700">
              <ExternalLink size={16} />
              Preview
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading || isDownloaded}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                isDownloaded
                  ? 'bg-emerald-600/20 text-emerald-400'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
            >
              {isDownloading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isDownloaded ? (
                <CheckCircle size={16} />
              ) : (
                <Download size={16} />
              )}
              {isDownloaded ? 'Installed' : isDownloading ? 'Installing...' : 'Install'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WorkflowMarketplace
