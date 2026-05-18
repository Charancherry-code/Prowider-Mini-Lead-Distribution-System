import { RequestServiceForm } from "@/client/components/RequestServiceForm";

export const metadata = {
  title: "Request Service",
  description: "Submit a service enquiry",
};

export default function RequestServicePage() {
  return (
    <div className="min-h-screen bg-slate-100 px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Request a service</h1>
        <p className="mb-8 text-slate-600">
          Submit your enquiry. The lead is saved and assigned to providers automatically.
        </p>
        <RequestServiceForm />
      </div>
    </div>
  );
}
