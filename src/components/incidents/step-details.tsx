"use client"

import { Controller, type UseFormReturn, useWatch } from "react-hook-form"
import { ShieldOff } from "lucide-react"

import { fieldA11y, FormField } from "@/components/shared/form-field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CURRENCIES, FRAUD_CATEGORIES, FRAUD_CATEGORY_IDS, PAYMENT_METHODS } from "@/lib/config/taxonomy"
import { cn } from "@/lib/utils"
import type { IncidentFormValues } from "@/lib/validation/incident"

const TRI_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
] as const

export function StepDetails({ form }: { form: UseFormReturn<IncidentFormValues> }) {
  const {
    register,
    control,
    formState: { errors },
  } = form
  const description = useWatch({ control, name: "description" }) ?? ""

  return (
    <div className="space-y-8">
      <div role="note" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
        <ShieldOff aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
        <div>
          <p className="font-medium text-foreground">
            Never enter passwords, UPI PINs, OTPs, full card numbers or banking logins.
          </p>
          <p className="mt-0.5 text-muted-foreground">
            STOPLOSS AI doesn&apos;t need them, and no genuine bank or official will ask you for them either.
          </p>
        </div>
      </div>

      <FormField id="category" label="What type of fraud do you suspect?" error={errors.category?.message} asFieldset>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={field.onChange}
              className="grid gap-2 sm:grid-cols-2"
              aria-invalid={errors.category ? true : undefined}
            >
              {FRAUD_CATEGORY_IDS.map((id) => {
                const meta = FRAUD_CATEGORIES[id]
                const checked = field.value === id
                return (
                  <label
                    key={id}
                    htmlFor={`cat-${id}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:border-primary/40",
                      checked && "border-primary bg-primary/8",
                    )}
                  >
                    <RadioGroupItem id={`cat-${id}`} value={id} className="mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{meta.label}</span>
                      <span className="block text-xs text-muted-foreground">{meta.description}</span>
                    </span>
                  </label>
                )
              })}
            </RadioGroup>
          )}
        />
      </FormField>

      <div className="grid gap-6 md:grid-cols-2">
        <FormField
          id="title"
          label="A short name for this case"
          optional
          hint="Helps you find it later, e.g. “Fake buyer on marketplace”."
          error={errors.title?.message}
          className="md:col-span-2"
        >
          <Input
            {...register("title")}
            {...fieldA11y("title", errors.title?.message, true)}
            placeholder="e.g. Fake KYC update SMS"
          />
        </FormField>

        <FormField
          id="description"
          label="What happened?"
          hint={
            <span className="flex justify-between gap-2">
              <span>In your own words: how the contact started, what you were asked to do, and what happened next.</span>
              <span className="shrink-0 tabular-nums">{description.length}/2000</span>
            </span>
          }
          error={errors.description?.message}
          className="md:col-span-2"
        >
          <Textarea
            {...register("description")}
            {...fieldA11y("description", errors.description?.message, true)}
            rows={5}
            placeholder="e.g. A buyer on a marketplace sent me a UPI request saying it was to receive money. After I approved it, ₹18,500 was debited…"
          />
        </FormField>

        <div className="grid grid-cols-[1fr_auto] gap-3">
          <FormField
            id="amount"
            label="Approximate amount lost"
            hint="Enter 0 if no money was lost."
            error={errors.amount?.message}
          >
            <Input
              {...register("amount")}
              {...fieldA11y("amount", errors.amount?.message, true)}
              inputMode="decimal"
              placeholder="18500"
            />
          </FormField>
          <FormField id="currency" label="Currency">
            <Controller
              control={control}
              name="currency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="currency" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>

        <FormField
          id="occurredAt"
          label="Approximately when did it happen?"
          hint="Your best estimate is fine."
          error={errors.occurredAt?.message}
        >
          <Input
            type="datetime-local"
            {...register("occurredAt")}
            {...fieldA11y("occurredAt", errors.occurredAt?.message, true)}
          />
        </FormField>

        <FormField id="paymentMethod" label="Payment method or affected platform" error={errors.paymentMethod?.message}>
          <Controller
            control={control}
            name="paymentMethod"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger {...fieldA11y("paymentMethod", errors.paymentMethod?.message)} className="w-full">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField
          id="transactionRef"
          label="Transaction reference"
          optional
          hint="The UTR / RRN / reference number from your bank SMS or payment app. Not your card number."
          error={errors.transactionRef?.message}
        >
          <Input
            {...register("transactionRef")}
            {...fieldA11y("transactionRef", errors.transactionRef?.message, true)}
            placeholder="e.g. 628104779213"
            autoComplete="off"
          />
        </FormField>

        <FormField
          id="counterparty"
          label="Money sent to"
          optional
          hint="The UPI ID, phone number or account the money went to, as shown in your payment app or bank SMS."
          error={errors.counterparty?.message}
        >
          <Input
            {...register("counterparty")}
            {...fieldA11y("counterparty", errors.counterparty?.message, true)}
            placeholder="e.g. name@okbank or 98765 43210"
            autoComplete="off"
          />
        </FormField>

        <FormField
          id="hasAccountAccess"
          label="Do you still have access to the affected account?"
          error={errors.hasAccountAccess?.message}
          asFieldset
        >
          <Controller
            control={control}
            name="hasAccountAccess"
            render={({ field }) => <TriRadio name="hasAccountAccess" value={field.value} onChange={field.onChange} />}
          />
        </FormField>

        <FormField
          id="ongoing"
          label="Is it still happening?"
          optional
          hint="For example, you're still receiving calls or seeing new transactions."
          asFieldset
        >
          <Controller
            control={control}
            name="ongoing"
            render={({ field }) => <TriRadio name="ongoing" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
      </div>
    </div>
  )
}

function TriRadio({ name, value, onChange }: { name: string; value?: string; onChange: (v: string) => void }) {
  return (
    <RadioGroup value={value ?? ""} onValueChange={onChange} className="flex flex-wrap gap-2">
      {TRI_OPTIONS.map((o) => (
        <label
          key={o.value}
          htmlFor={`${name}-${o.value}`}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary/40",
            value === o.value && "border-primary bg-primary/8",
          )}
        >
          <RadioGroupItem id={`${name}-${o.value}`} value={o.value} />
          {o.label}
        </label>
      ))}
    </RadioGroup>
  )
}
