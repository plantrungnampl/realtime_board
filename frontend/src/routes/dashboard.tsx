import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useAppStore } from '@/store/useAppStore'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { TemplateGallery } from '@/components/dashboard/TemplateGallery'
import { BoardList } from '@/components/dashboard/BoardList'
import { OrganizationInvitations } from '@/features/organizations/components/OrganizationInvitations'
import { normalizeDashboardView } from '@/components/dashboard/dashboardView'
import {
  normalizeOwnerFilter,
  normalizeSort,
} from '@/components/dashboard/dashboardFilters'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const store = useAppStore.getState()
    const token = localStorage.getItem('token')
    if (!token) {
      throw redirect({
        to: '/login',
      })
    }

    await store.checkAuth()
    const latestState = useAppStore.getState()
    if (!latestState.isAuthenticated) {
      throw redirect({
        to: '/login',
      })
    }
    if (latestState.requiresEmailVerification) {
      throw redirect({
        to: '/register/setup',
      })
    }
  },
  component: Dashboard,
})

function Dashboard() {
  const navigate = useNavigate()
  const search = Route.useSearch() as {
    view?: string
    owner?: string
    sort?: string
  }
  const view = normalizeDashboardView(search.view)
  const ownerFilter = normalizeOwnerFilter(search.owner)
  const sortBy = normalizeSort(search.sort)

  const updateSearch = (next: {
    view?: string
    owner?: string
    sort?: string
  }) => {
    navigate({
      to: '/dashboard',
      search: {
        view,
        owner: ownerFilter,
        sort: sortBy,
        ...next,
      },
    })
  }

  return (
    <div className="flex h-screen bg-bg-base text-text-primary font-body overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar
        activeView={view}
        onViewChange={(nextView) => updateSearch({ view: nextView })}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        
        <main className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 max-w-[1600px] mx-auto w-full flex flex-col gap-8">
            <OrganizationInvitations />
            {/* Template Gallery Section */}
            <div className="w-full overflow-hidden">
                <TemplateGallery />
            </div>

            {/* Boards List Section */}
            <BoardList
              view={view}
              ownerFilter={ownerFilter}
              sortBy={sortBy}
              onFilterChange={(next) => updateSearch(next)}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
