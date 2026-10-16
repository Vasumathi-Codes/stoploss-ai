"use client"

import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { FlaskConical } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { fieldA11y, FormField } from "@/components/shared/form-field"
import { PageHeader } from "@/components/shared/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIncidents, useProfile } from "@/features/cases/hooks"
import { profileService } from "@/lib/services"

const LANGUAGES = [
  "English",
  "हिन्दी (Hindi)",
  "தமிழ் (Tamil)",
  "తెలుగు (Telugu)",
  "ಕನ್ನಡ (Kannada)",
  "मराठी (Marathi)",
  "বাংলা (Bengali)",
]

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter at least 2 characters").max(40, "Keep it under 40 characters"),
  email: z.string().trim().email("Enter a valid email format"),
  preferredLanguage: z.string(),
  city: z.string().trim().max(40, "Keep it under 40 characters"),
})

type ProfileValues = z.infer<typeof profileSchema>

export function ProfileView() {
  const profile = useProfile()
  const incidents = useIncidents()
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      displayName: profile.displayName,
      email: profile.email,
      preferredLanguage: profile.preferredLanguage,
      city: profile.city,
    },
  })
  const { errors, isDirty } = form.formState
  const language = useWatch({ control: form.control, name: "preferredLanguage" })

  const submit = form.handleSubmit((values) => {
    profileService.updateProfile(values)
    toast.success("Profile updated", { description: "Saved in this tab's memory only." })
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="A demo profile. There is no real account, sign-in or identity verification in this prototype."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit items-center gap-3 p-6 text-center">
          <Avatar className="size-20">
            <AvatarFallback className="bg-primary/15 text-2xl font-semibold text-primary">
              {profile.displayName
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-semibold">{profile.displayName}</p>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <FlaskConical aria-hidden className="size-3.5" />
            Demo profile · not signed in
          </span>
          <dl className="mt-2 grid w-full grid-cols-2 gap-3 border-t pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Cases</dt>
              <dd className="font-semibold">{incidents.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Phone</dt>
              <dd className="font-mono text-xs">{profile.phoneHint}</dd>
            </div>
          </dl>
        </Card>

        <Card className="gap-6 p-6">
          <form onSubmit={submit} noValidate className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <FormField id="displayName" label="Display name" error={errors.displayName?.message}>
                <Input {...form.register("displayName")} {...fieldA11y("displayName", errors.displayName?.message)} />
              </FormField>
              <FormField id="email" label="Email" hint="Placeholder only — no emails are sent." error={errors.email?.message}>
                <Input type="email" {...form.register("email")} {...fieldA11y("email", errors.email?.message, true)} />
              </FormField>
              <FormField
                id="preferredLanguage"
                label="Preferred language"
                hint="Interface translations are planned for a later phase."
              >
                <Select value={language} onValueChange={(v) => form.setValue("preferredLanguage", v, { shouldDirty: true })}>
                  <SelectTrigger {...fieldA11y("preferredLanguage", undefined, true)} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField id="city" label="City" optional error={errors.city?.message}>
                <Input {...form.register("city")} {...fieldA11y("city", errors.city?.message)} />
              </FormField>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!isDirty}>
                Save changes
              </Button>
              <Button type="button" variant="ghost" disabled={!isDirty} onClick={() => form.reset()}>
                Discard
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
