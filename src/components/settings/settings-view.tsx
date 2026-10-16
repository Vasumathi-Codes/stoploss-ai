"use client"

import { useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Bell, ExternalLink, Laptop, Moon, Palette, RotateCcw, ShieldCheck, Sun } from "lucide-react"
import { toast } from "sonner"

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { demoService } from "@/lib/services"
import { useUiPreferences } from "@/lib/store/ui-preferences"
import { cn } from "@/lib/utils"

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const

const noop = () => () => {}

export function SettingsView() {
  const { theme, setTheme } = useTheme()
  // next-themes only knows the theme on the client.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
  const prefs = useUiPreferences()
  const [resetOpen, setResetOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Preferences for this browser. Only these non-sensitive settings are saved on your device."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette aria-hidden className="size-4.5 text-primary" />
              Appearance
            </CardTitle>
            <CardDescription>Choose how STOPLOSS AI looks.</CardDescription>
          </CardHeader>
          <CardContent>
            <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => {
                const active = mounted && theme === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTheme(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-colors hover:border-primary/40",
                      active && "border-primary bg-primary/8",
                    )}
                  >
                    <t.icon aria-hidden className="size-5" />
                    {t.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-5 flex items-center justify-between gap-4">
              <Label htmlFor="pref-sidebar" className="font-normal">
                Collapse the sidebar on large screens
              </Label>
              <Switch
                id="pref-sidebar"
                checked={prefs.sidebarCollapsed}
                onCheckedChange={(v) => prefs.setPreference("sidebarCollapsed", v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell aria-hidden className="size-4.5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription>In-app notifications only. Nothing is sent by email or SMS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PrefSwitch
              id="pref-agent"
              label="Agent updates"
              description="Toasts and bell notifications when a simulated analysis starts or finishes."
              checked={prefs.notifyAgentUpdates}
              onChange={(v) => prefs.setPreference("notifyAgentUpdates", v)}
            />
            <PrefSwitch
              id="pref-tasks"
              label="Task reminders"
              description="Reminders about open urgent steps. (Reminders are not scheduled in Demo Mode.)"
              checked={prefs.notifyTaskReminders}
              onChange={(v) => prefs.setPreference("notifyTaskReminders", v)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink aria-hidden className="size-4.5 text-primary" />
              External links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PrefSwitch
              id="pref-links"
              label="Confirm before opening external sites"
              description="Shows the full address and a reminder that STOPLOSS AI doesn't represent the organisation."
              checked={prefs.confirmExternalLinks}
              onChange={(v) => prefs.setPreference("confirmExternalLinks", v)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck aria-hidden className="size-4.5 text-primary" />
              Privacy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Case details, notes and evidence are held in memory for this tab only and are never sent anywhere.</li>
              <li>Only the preferences on this page are saved in your browser&apos;s local storage.</li>
              <li>There is no account, tracking or analytics in this demo.</li>
              <li>A production version will need a reviewed privacy policy, encryption and data-retention rules.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw aria-hidden className="size-4.5 text-destructive" />
            Reset demo data
          </CardTitle>
          <CardDescription>
            Removes cases, notes and evidence you added and restores the original fictional sample cases. Your preferences are
            kept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setResetOpen(true)}>
            Reset demo data
          </Button>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all demo data?"
        description={
          <>
            <p>
              Any cases, notes, task progress and evidence you added in this session will be removed. Running simulations are
              stopped.
            </p>
            <p>The sample cases will be restored exactly as they were at launch.</p>
          </>
        }
        confirmLabel="Reset demo data"
        destructive
        onConfirm={() => {
          demoService.resetDemoData()
          toast.success("Demo data reset", { description: "Sample cases restored." })
          router.push("/dashboard")
        }}
      />
    </div>
  )
}

function PrefSwitch({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-desc`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-desc`} />
    </div>
  )
}
