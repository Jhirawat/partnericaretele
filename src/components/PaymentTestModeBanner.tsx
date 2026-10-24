const clientToken = import.meta.env['VITE_PAYMENTS_CLIENT_TOKEN'] as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
        Production checkout is not configured. Complete go-live in the Payments tab to accept real payments.
      </div>
    );
  }
  if (clientToken.startsWith('pk_test_')) {
    return (
      <div className="w-full border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
        All payments made in the preview are in test mode.{' '}
        <a
          href="https://docs.lovable.dev/features/payments#test-and-live-environments"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          Read more
        </a>
      </div>
    );
  }
  return null;
}
