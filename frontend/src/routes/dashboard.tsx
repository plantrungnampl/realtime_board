import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAppStore } from '@/store/useAppStore'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { TopBar } from '@/components/dashboard/TopBar'
import { TemplateGallery } from '@/components/dashboard/TemplateGallery'
import { BoardList } from '@/components/dashboard/BoardList'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const store = useAppStore.getState()
    if (!store.isAuthenticated) {
      const token = localStorage.getItem('token')
      if (!token) {
        throw redirect({
          to: '/login',
        })
      }
      
      // Attempt to restore session
      await store.checkAuth()
      if (!useAppStore.getState().isAuthenticated) {
        throw redirect({
          to: '/login',
        })
      }
    }
  },
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="flex h-screen bg-bg-base text-text-primary font-body overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        
        <main className="flex-1 overflow-y-auto">
          <div className="px-8 py-6 max-w-[1600px] mx-auto w-full flex flex-col gap-8">
            {/* Template Gallery Section */}
            <div className="w-full overflow-hidden">
                <TemplateGallery />
            </div>

            {/* Boards List Section */}
            <BoardList />
          </div>
        </main>
      </div>
    </div>
  )
}