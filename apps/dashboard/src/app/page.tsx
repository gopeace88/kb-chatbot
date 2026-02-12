export default function DashboardHome() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">KB Chatbot 대시보드</h1>
      <p className="mt-2 text-gray-600">
        지식 베이스 관리 및 고객 문의 대시보드입니다.
      </p>

      {/* Phase 5에서 통계 카드 구현 */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">총 지식 베이스</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">오늘 문의</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">자동 답변률</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-medium text-gray-500">신규 문의</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">-</p>
        </div>
      </div>
    </div>
  );
}
