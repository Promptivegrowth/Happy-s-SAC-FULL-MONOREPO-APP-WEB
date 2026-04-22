import { CheckoutClient } from './checkout-client';

export const metadata = { title: 'Checkout' };

export default function CheckoutPage() {
  return (
    <div className="container px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-semibold">Finaliza tu compra</h1>
      <CheckoutClient />
    </div>
  );
}
