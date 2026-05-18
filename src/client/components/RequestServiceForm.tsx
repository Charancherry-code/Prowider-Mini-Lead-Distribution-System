"use client";

import { useEffect, useState } from "react";

type ServiceOption = { id: string; name: string };

export function RequestServiceForm() {
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    void fetch("/api/services")
      .then((r) => r.json())
      .then((payload) => {
        if (payload.success && payload.data.length > 0) {
          setServices(payload.data);
          setServiceId(payload.data[0].id);
        }
      })
      .catch(() => setServices([]));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/leads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          city,
          serviceId,
          description: description || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message ?? data.error ?? "Submission failed");
      }

      setMessage({
        type: "success",
        text: `Lead submitted and assigned to ${data.data.allocatedProviders.length} providers.`,
      });
      setName("");
      setPhone("");
      setCity("");
      setDescription("");
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Submission failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto max-w-lg space-y-5 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
    >
      <FormField label="Name" required>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          placeholder="Your full name"
        />
      </FormField>

      <FormField label="Phone Number" required>
        <input
          className={inputClass}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          minLength={10}
          maxLength={15}
          placeholder="9999999999"
          inputMode="numeric"
        />
      </FormField>

      <FormField label="City" required>
        <input
          className={inputClass}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
          minLength={2}
          placeholder="Your city"
        />
      </FormField>

      <FormField label="Service Type" required>
        <select
          className={inputClass}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          required
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Description">
        <textarea
          className={`${inputClass} min-h-[100px] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          placeholder="Describe what you need"
        />
      </FormField>

      {message && (
        <p
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !serviceId}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:bg-slate-400"
      >
        {loading ? "Submitting…" : "Submit enquiry"}
      </button>
    </form>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
