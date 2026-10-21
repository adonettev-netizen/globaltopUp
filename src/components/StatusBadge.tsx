export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending_payment: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Awaiting payment' },
    payment_confirmed: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Payment confirmed' },
    payment_failed: { bg: 'bg-red-50', text: 'text-red-700', label: 'Payment failed' },
    refund_pending: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Refund pending' },
    refunded: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Refunded' },
    pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' },
    processing: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Processing' },
    completed: { bg: 'bg-accent-50', text: 'text-accent-700', label: 'Completed' },
    recharge_failed: { bg: 'bg-red-50', text: 'text-red-700', label: 'Recharge failed' },
    succeeded: { bg: 'bg-accent-50', text: 'text-accent-700', label: 'Succeeded' },
    failed: { bg: 'bg-red-50', text: 'text-red-700', label: 'Failed' },
  };

  const c = config[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
