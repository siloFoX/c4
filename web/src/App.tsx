import WorkerList from './components/WorkerList';

export default function App() {
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-gray-800 bg-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-100">C4 Dashboard</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-900 p-4">
          <img src="/logo.svg" alt="C4" className="mb-4 h-10" />
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
            Workers
          </h2>
          <WorkerList />
        </aside>
        <main className="flex-1 overflow-y-auto p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Worker detail</h2>
          <p className="text-gray-400">Select a worker from the sidebar to view details.</p>
        </main>
      </div>
    </div>
  );
}
