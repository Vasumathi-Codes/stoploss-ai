import type { LearningCategory, LearningResource } from "@/types"

/**
 * Educational content for the Resources page. Kept in one place so it can be
 * replaced by reviewed, maintained content later. General guidance only — no
 * statutory deadlines, legal advice or recovery guarantees.
 */
export const LEARNING_CATEGORIES: Record<LearningCategory, string> = {
  recognize: "Recognizing common scams",
  preserve: "What to preserve",
  secure: "Securing accounts",
  report: "Reporting a payment scam",
  recovery_scams: "Avoiding recovery scams",
  protect: "Protecting your information",
}

export const LEARNING_RESOURCES: LearningResource[] = [
  {
    id: "collect-request",
    category: "recognize",
    title: 'UPI collect requests and "receive money" tricks',
    summary: "Entering your UPI PIN always sends money. It is never needed to receive a payment.",
    points: [
      'A request that asks for your PIN to "receive" a refund or prize is a payment request.',
      "Scanning a QR code someone sends you can also start a payment.",
      "Check the payee name and amount on the confirmation screen before you approve anything.",
    ],
    readMinutes: 2,
  },
  {
    id: "impersonation-signs",
    category: "recognize",
    title: "Signs of an impersonation call",
    summary: "Urgency, secrecy and requests to install apps are common pressure tactics.",
    points: [
      "Callers may claim to be from a bank, courier, telecom provider or government office.",
      'Requests to install screen-sharing or "support" apps are a strong warning sign.',
      "Hang up and call back using a number you find yourself on an official source.",
    ],
    readMinutes: 3,
  },
  {
    id: "investment-groups",
    category: "recognize",
    title: "Trading groups that promise fixed returns",
    summary: 'Groups showing large paper profits that then ask for "tax" or "fees" to withdraw.',
    points: [
      "A dashboard showing profits does not mean the money exists.",
      "Repeated fees to unlock a withdrawal are a common pattern.",
      "Check whether a platform is registered with the relevant regulator before investing.",
    ],
    readMinutes: 3,
  },
  {
    id: "what-to-keep",
    category: "preserve",
    title: "Information worth preserving",
    summary: "Small details like a UTR number or the exact time can make reports much easier to follow up.",
    points: [
      "Transaction reference numbers (UTR / RRN), amounts, dates and times.",
      "Screenshots of chats, call logs, SMS, payment confirmations and the scam website or profile.",
      "The phone numbers, UPI IDs, account names or links the other party used.",
      "Don't delete conversations, even if they are upsetting to look at.",
    ],
    readMinutes: 2,
  },
  {
    id: "screenshot-tips",
    category: "preserve",
    title: "Taking useful screenshots",
    summary: "Capture context: who, when and how much.",
    points: [
      "Include the date, time and the other party's name or number in the frame.",
      "Save originals; avoid cropping out identifying details of the scammer.",
      "Crop out or avoid capturing your own passwords, PINs or full card numbers.",
    ],
    readMinutes: 2,
  },
  {
    id: "secure-accounts",
    category: "secure",
    title: "Securing an account you think is compromised",
    summary: "Regain control first, then review what changed.",
    points: [
      "Change passwords from a device you trust, starting with your email account.",
      "Turn on two-step verification where available.",
      "Review linked devices, recovery phone numbers and email forwarding rules.",
      "Uninstall any remote-access app you were asked to install.",
    ],
    readMinutes: 3,
  },
  {
    id: "contact-bank",
    category: "report",
    title: "Contacting your bank or payment provider",
    summary: "Use the official channel and keep a record of what you were told.",
    points: [
      "Use the number on your card, passbook or the official app — not one from a search ad.",
      "Ask for a complaint or reference number and note the date and time of the call.",
      "Ask what they need from you in writing, if anything.",
    ],
    readMinutes: 2,
  },
  {
    id: "cybercrime-report",
    category: "report",
    title: "Preparing a cybercrime complaint",
    summary: "Having details organised before you start makes the process calmer.",
    points: [
      "Keep transaction details, the other party's identifiers and a short timeline ready.",
      "Have your evidence files ready to attach.",
      "Save any acknowledgement or complaint number you receive.",
    ],
    readMinutes: 3,
  },
  {
    id: "recovery-scams",
    category: "recovery_scams",
    title: 'Beware of "we can recover your money" offers',
    summary: "Victims are often targeted a second time by fake recovery agents.",
    points: [
      "Be cautious of anyone who contacts you offering to recover funds for a fee.",
      "Official bodies do not ask for upfront payments to process a complaint.",
      "Verify any caller claiming to be police or a bank through an official channel.",
    ],
    readMinutes: 2,
  },
  {
    id: "never-share",
    category: "protect",
    title: "What you should never share",
    summary: "No genuine bank, police officer or app support agent needs these.",
    points: [
      "OTPs, UPI PINs, card CVV or full card numbers.",
      "Net-banking passwords or app login credentials.",
      "Remote access to your phone or computer.",
    ],
    readMinutes: 1,
  },
  {
    id: "sim-safety",
    category: "protect",
    title: "Protecting your phone number",
    summary: "Your number is often the key to your bank and payment accounts.",
    points: [
      "Be alert if your mobile signal suddenly disappears for a long period.",
      "Contact your telecom provider if you receive unexpected SIM change messages.",
      "Check which mobile connections are registered in your name through official telecom channels.",
    ],
    readMinutes: 2,
  },
]
