/**
 * Legal documents — the three the store listing and the old site required.
 *
 * Structured rather than HTML strings on purpose: the body renders to real
 * elements, so headings stay in the document outline, links are real links, and
 * the text stays greppable and diffable. Inline emphasis uses a deliberately
 * tiny markup (`**bold**`, `` `code` ``, `[text](href)`) parsed in
 * features/legal — no `dangerouslySetInnerHTML` anywhere.
 *
 * Source: the studio's existing published policies. Copy is the legal text as
 * written — do not paraphrase clause wording.
 */

/** One run of body copy. Emphasis is inline markup, parsed at render time. */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "h3"; text: string }
  /** A boxed aside — used for the cross-link between the three documents. */
  | { kind: "callout"; title: string; text: string };

export interface LegalDoc {
  /** Route, without the leading slash. */
  slug: string;
  /** Nav/footer label. */
  label: string;
  /** <title> suffix and the big page heading. */
  title: string;
  /** Meta description. */
  description: string;
  /** Small mono line above the heading. */
  kicker: string;
  /** The sub-heading under the document title. */
  standfirst: string;
  /** Shown in the meta rail. `value` is inline-markup text. */
  meta: { label: string; value: string }[];
  /** Effective date line. */
  effective: string;
  /** Up to three cards under the header. */
  summary: { title: string; text: string }[];
  sections: LegalBlock[];
}

const OPERATOR = "Aquastar Games";
const PRODUCT = "Block: Build It Up";
/** The address the studio publishes on every legal document. */
export const LEGAL_CONTACT = "aquastarsupport@gmail.com";
export const EFFECTIVE_DATE = "September 18, 2026";

export const legalDocs: LegalDoc[] = [
  {
    slug: "privacy",
    label: "Privacy Policy",
    title: "Privacy Policy",
    description:
      "Privacy Policy for Block: Build It Up by Aquastar Games — what data is handled, what stays on your device, and what advertising providers process.",
    kicker: "Privacy / Block: Build It Up",
    standfirst: "Information handling, clearly stated.",
    effective: `Effective date: ${EFFECTIVE_DATE}`,
    meta: [
      { label: "Operator", value: OPERATOR },
      { label: "Product", value: PRODUCT },
    ],
    summary: [
      {
        title: "Local-first saves",
        text: "Progress and settings remain in the app’s private storage.",
      },
      {
        title: "No player accounts",
        text: "No chat, profiles or developer-run game servers.",
      },
      {
        title: "Advertising partners",
        text: "Ad-related data is processed by third-party SDKs under their policies.",
      },
    ],
    sections: [
      {
        kind: "p",
        text: `This Privacy Policy explains what information is handled when you use **${PRODUCT}**, what remains on your device, and what is processed by integrated advertising providers. The game is operated by **${OPERATOR}** (the “Service Provider”).`,
      },
      {
        kind: "h3",
        text: "1. Scope and key points",
      },
      {
        kind: "ul",
        items: [
          "The Application does not require an account and does not provide chat or social profiles.",
          "Game progress and settings are stored locally and are removed when app data is cleared or the Application is uninstalled, subject to operating-system backups.",
          "Advertising is delivered through Unity LevelPlay mediation. The current mediation stack includes Unity Ads and Yandex Mobile Ads; the Yandex adapter also bundles AppMetrica analytics. AppLovin may be added in a future update.",
        ],
      },
      {
        kind: "h3",
        text: "2. Information stored on your device",
      },
      {
        kind: "p",
        text: "The game stores a local `save.json` file in the Application’s private storage (`Application.persistentDataPath`). It may contain story progress, endless-mode best score, coins, hearts, boosters, music, sound, haptics, language and tutorial settings.",
      },
      {
        kind: "ul",
        items: [
          `${OPERATOR} does not operate a server that receives this save file.`,
          "The Application itself does not request your name, email address, telephone number or precise location.",
          "Deleting app data or uninstalling the Application removes the local data, subject to device and backup behaviour outside our control.",
        ],
      },
      {
        kind: "h3",
        text: "3. Advertising and automatically collected information",
      },
      {
        kind: "p",
        text: "When advertising is displayed, the mediation SDK and participating ad networks may automatically process:",
      },
      {
        kind: "ul",
        items: [
          "advertising identifiers, including the Google Advertising ID and Android `AD_ID` permission;",
          "device and technical information, including model, operating-system version, app version, language and network state;",
          "IP address, including for approximate location and fraud prevention by ad providers;",
          "advertising and app events, including impressions, clicks, video completion, rewarded callbacks and SDK diagnostics.",
        ],
      },
      {
        kind: "p",
        text: "This information is used by the relevant providers for ad delivery, frequency capping, fraud prevention and measurement. The Application declares the permissions `INTERNET`, `ACCESS_NETWORK_STATE`, `AD_ID` and `VIBRATE`. `VIBRATE` supports haptics and is not used for data collection. The bundled advertising SDKs additionally contribute `ACCESS_ADSERVICES_TOPICS`, `ACCESS_ADSERVICES_ATTRIBUTION`, `WAKE_LOCK`, `RECEIVE_BOOT_COMPLETED`, `FOREGROUND_SERVICE` and `BIND_GET_INSTALL_REFERRER_SERVICE`; these are added by those libraries rather than requested by the game itself, and are used for ad delivery, attribution and background upload of ad events. The game has no feature that depends on them.",
      },
      {
        kind: "h3",
        text: "4. Third-party providers",
      },
      {
        kind: "p",
        text: "Third-party providers process information under their own terms and privacy policies:",
      },
      {
        kind: "ul",
        items: [
          "[Google Play Services](https://policies.google.com/privacy) — Google Privacy Policy",
          "[Unity Ads / LevelPlay](https://unity.com/legal/privacy-policy) — Unity Privacy Policy",
          "[ironSource / Unity LevelPlay](https://www.is.com/privacy-policy/) — ironSource Privacy Policy and [LevelPlay documentation](https://docs.unity.com/grow/levelplay/)",
          "[Yandex Mobile Ads](https://yandex.com/legal/confidential/) — Yandex Privacy Policy",
          "[AppMetrica](https://appmetrica.yandex.com/privacy/) — AppMetrica Privacy Policy (bundled with the Yandex adapter)",
          "[AppLovin](https://www.applovin.com/privacy/), if enabled in a future release — AppLovin Privacy Policy",
        ],
      },
      {
        kind: "p",
        text: "The exact set of mediated networks may change as the Application is updated. The categories of information remain those described in this Policy.",
      },
      {
        kind: "h3",
        text: "5. Cookies, consent and use of information",
      },
      {
        kind: "p",
        text: "The Application does not set browser cookies. Third-party advertising SDKs may use SDK-local identifiers and similar technologies for delivery, frequency capping and measurement. The Application contains no in-game consent dialog and requests no consent prompt: personalised advertising is limited by the device-level controls described in section 7, and by the region and age settings configured by the ad providers themselves.",
      },
      {
        kind: "p",
        text: `${OPERATOR} uses the information under its control to operate the offline-first game, support advertising functionality, apply frequency limits, prevent fraud and diagnose advertising integrations. The Application has no push or email marketing programme.`,
      },
      {
        kind: "h3",
        text: "6. Disclosure and international processing",
      },
      {
        kind: "p",
        text: "Automatically collected advertising information may be disclosed to the providers listed above, where required by law, or where necessary to protect rights, safety and the integrity of the service. Aquastar Games does not sell personal information. Ad-network processing and any sale or sharing defined by those providers is governed by their policies and your consent or device settings.",
      },
      {
        kind: "p",
        text: `Aquastar Games operates no server-side personal-data store for the Application. Third-party providers may process information outside your country, including outside the EEA, using the lawful mechanisms described in their policies.`,
      },
      {
        kind: "h3",
        text: "7. Your choices and rights",
      },
      {
        kind: "ul",
        items: [
          "Uninstalling the Application stops further collection by the Application. Information already sent to an ad provider remains subject to that provider’s retention policy.",
          `You may request access, correction or deletion of personal data held by ${OPERATOR}, withdraw consent, or submit applicable privacy-rights requests by emailing **${LEGAL_CONTACT}**.`,
          "Device-level controls include Android Settings → Privacy → Ads → “Delete advertising ID”, together with the controls offered by Google, Yandex and AppLovin.",
        ],
      },
      { kind: "h3", text: "8. How to request deletion of your data" },
      {
        kind: "p",
        text: `This section is the deletion-request guide for **${PRODUCT}** by **${OPERATOR}**, as required by Google Play. There are no accounts: nothing identifies you on our side, so a request needs no login and no user ID.`,
      },
      {
        kind: "ul",
        items: [
          `Step 1 — email us: write to **${LEGAL_CONTACT}** with the subject “Data deletion — ${PRODUCT}”. Any mailbox works; no account or identifier is required.`,
          "Step 2 — we reply within 30 days confirming: (a) we hold no server-side copy of your data, so there is nothing to delete on our servers; (b) how to remove local data, see Step 3; (c) where provider-held data lives and how to limit it, see Step 4.",
          "Step 3 — remove local data now, without waiting for our reply: uninstall the Application, or clear its app data via Android Settings → Apps → Block: Build It Up → Storage → Clear data. This deletes progress, settings, coins, hearts and boosters from the device immediately.",
          "Step 4 — stop provider-side collection: Android Settings → Privacy → Ads → “Delete advertising ID”, plus the opt-outs of Google, Yandex and AppLovin linked in §4.",
        ],
      },
      {
        kind: "p",
        text: "What is deleted, what is kept, and for how long:",
      },
      {
        kind: "ul",
        items: [
          `Deleted immediately: the local save (progress, coins, hearts, boosters, settings) on uninstall or Clear data. No server copy exists, so nothing of yours is retained by ${OPERATOR} afterwards.`,
          "Not deletable by us: advertising identifiers, device information, IP address and ad interactions already sent to Unity, Yandex or AppLovin — retained under their own policies (typically up to 24 months for identifiers and logs). We cannot delete provider-held data; Step 4 limits further collection.",
          "Kept as required: our email correspondence about your request, for as long as needed to handle it and as required by applicable law.",
        ],
      },
      { kind: "h3", text: "9. Retention" },
      {
        kind: "ul",
        items: [
          "Local game data remains on your device until you delete it. Aquastar Games keeps no server copy.",
          "Advertising providers retain identifiers and event data under their own policies; their retention periods may differ by provider and jurisdiction.",
          "Information required for legal compliance is retained for the period required by applicable law.",
        ],
      },
      { kind: "h3", text: "10. Children" },
      {
        kind: "p",
        text: "The Application is a general-audience casual puzzle game and is not directed at children under the applicable age of digital consent. Aquastar Games does not conduct behavioural profiling. Where required by law, personalised advertising to a user below the applicable threshold is shown only with verifiable parental consent; otherwise contextual or non-personalised advertising is used.",
      },
      { kind: "h3", text: "11. Security and policy changes" },
      {
        kind: "p",
        text: `${OPERATOR} applies reasonable safeguards to the code and configuration it controls. No method of storage or transmission is completely secure. If a breach affecting personal information under our control occurs, we will provide notice as required by law.`,
      },
      {
        kind: "p",
        text: `Material changes will be published with a new effective date. Where legally required, consent will be requested before the change takes effect. Previous versions are available from **${LEGAL_CONTACT}**.`,
      },
      { kind: "h3", text: "12. Contact" },
      {
        kind: "p",
        text: `For privacy questions or requests, contact **${LEGAL_CONTACT}**. The Service Provider is ${OPERATOR}.`,
      },
    ],
  },

  {
    slug: "terms",
    label: "Terms of Use",
    title: "Terms of Use",
    description:
      "Terms of Service for Block: Build It Up by Aquastar Games — the licence, advertising, virtual items and acceptable use that apply to the game.",
    kicker: "Legal / Block: Build It Up",
    standfirst: "Terms for using the Application.",
    effective: `Effective date: ${EFFECTIVE_DATE}`,
    meta: [
      { label: "Operator", value: OPERATOR },
      { label: "Contact", value: LEGAL_CONTACT },
    ],
    summary: [
      {
        title: "Personal licence",
        text: "Use is limited to personal, non-commercial entertainment.",
      },
      {
        title: "Offline-first",
        text: "No player accounts or developer-run game servers.",
      },
      {
        title: "Free to play",
        text: "The current version offers no in-app purchases.",
      },
    ],
    sections: [
      {
        kind: "p",
        text: `These Terms govern your use of **${PRODUCT}**, operated by **${OPERATOR}** (the “Service Provider”). By downloading, installing or using the Application, you accept these Terms. If you do not accept them, do not use the Application.`,
      },
      { kind: "h3", text: "1. Licence to use the Application" },
      {
        kind: "p",
        text: "We grant you a limited, non-exclusive, non-transferable and revocable licence to install and use the Application for personal, non-commercial entertainment on a device you own or control. Your use must comply with these Terms and the applicable app-store terms, including Google Play’s terms.",
      },
      {
        kind: "p",
        text: "Except where applicable law gives you a right that cannot be waived, you may not copy beyond ordinary installation or backup, modify, reverse-engineer, decompile, rent, lease, lend, sell, redistribute or create derivative works from the Application.",
      },
      { kind: "h3", text: "2. Application operation and updates" },
      {
        kind: "ul",
        items: [
          "The Application is offline-first. Progress and settings are stored locally in the Application’s private storage.",
          "There are no player accounts and no developer-run servers. Clearing app data or uninstalling the Application deletes local progress, subject to backups controlled by your device.",
          "We may add, change or remove content and features through updates. Your continued use after an update means you accept the updated Application and these Terms as amended where applicable.",
        ],
      },
      { kind: "h3", text: "3. Advertising" },
      {
        kind: "p",
        text: "The Application is free and may display rewarded and interstitial advertising through Unity LevelPlay mediation.",
      },
      {
        kind: "ul",
        items: [
          "A rewarded benefit is granted only after the ad network confirms completion. If an ad is skipped, fails or loses connection, the benefit may not be granted.",
          "Interstitial advertising is frequency-capped and is not shown during the tutorial.",
          "Ad availability depends on region, connection and network inventory. If no ad is available, the game continues without it.",
        ],
      },
      {
        kind: "p",
        text: "Information processed for advertising is described in the [Privacy Policy](/privacy).",
      },
      { kind: "h3", text: "4. Virtual items" },
      {
        kind: "p",
        text: "The Application may contain coins, hearts, boosters and unlocked levels. These items have **no monetary value**. In the current version they are earned through gameplay or rewarded advertising and cannot be purchased with real money, sold, transferred, exchanged or redeemed for cash.",
      },
      {
        kind: "p",
        text: "Virtual items may be adjusted, capped or reset by an update or by deleting local Application data. If in-app purchases are introduced in a future version, these Terms will be updated before they become available and the relevant app-store billing and refund terms will apply.",
      },
      { kind: "h3", text: "5. Acceptable use" },
      {
        kind: "p",
        text: "You must not cheat, exploit bugs, automate gameplay, interfere with advertising or the normal operation of the Application, tamper with save files to gain an unfair advantage in any shared or competitive feature, or use the Application in breach of applicable law. We may use technical measures such as save validation and cooldowns to protect fair play.",
      },
      { kind: "h3", text: "6. Intellectual property" },
      {
        kind: "p",
        text: "The Application, including its code, art, levels, music and trademarks, is owned by the Service Provider or its licensors and is protected by intellectual-property laws. These Terms do not transfer ownership to you. Third-party SDKs and advertising materials remain the property of their respective owners.",
      },
      { kind: "h3", text: "7. Third-party services" },
      {
        kind: "p",
        text: "The Application integrates third-party advertising and mediation services. Those services operate under their own terms and privacy policies. We are not responsible for third-party content, advertising or linked websites, although we take reasonable care when selecting integrated SDKs.",
      },
      { kind: "h3", text: "8. Disclaimers" },
      {
        kind: "p",
        text: "To the maximum extent permitted by law, the Application is provided “AS IS” and “AS AVAILABLE”, without warranties of merchantability, fitness for a particular purpose, uninterrupted availability or error-free operation. Progress depends on your device storage and backups under your control.",
      },
      { kind: "h3", text: "9. Limitation of liability" },
      {
        kind: "p",
        text: "To the maximum extent permitted by law, the Service Provider is not liable for indirect, incidental, special, consequential or punitive damages, or for loss of data, progress or profits. Our total liability for a claim arising from the Application is limited to the amount paid for the Application (the current base game is free) or the minimum amount required by applicable law. Nothing limits liability that cannot legally be limited, including liability for death or personal injury caused by negligence or fraud where applicable.",
      },
      { kind: "h3", text: "10. Termination" },
      {
        kind: "p",
        text: "You may stop using the Application at any time by uninstalling it. We may suspend or terminate access where you materially breach these Terms, to the extent technically feasible for an offline-first Application, including through updates or store delisting. Sections concerning intellectual property, disclaimers, liability and changes survive termination.",
      },
      { kind: "h3", text: "11. Changes to these Terms" },
      {
        kind: "p",
        text: `We may update these Terms when the Application changes, including when adding purchases, multiplayer or other material features. Material changes will be published with a new effective date. Previous versions are available from **${LEGAL_CONTACT}**.`,
      },
      { kind: "h3", text: "12. Governing law and contact" },
      {
        kind: "p",
        text: "These Terms are governed by the laws applicable at your place of residence to the extent mandatory consumer protections apply. Otherwise, disputes are resolved under the laws of the Service Provider’s jurisdiction, subject to non-waivable local rights.",
      },
      {
        kind: "p",
        text: `Questions about these Terms: **${LEGAL_CONTACT}**.`,
      },
    ],
  },

  {
    slug: "privacy-notice",
    label: "Privacy Notice",
    title: "Privacy Notice",
    description:
      "Short privacy notice for Block: Build It Up by Aquastar Games — how device data and advertising are handled, and the controls available to you.",
    kicker: "Privacy / Quick reference",
    standfirst: "What the game handles.",
    effective: `Effective date: ${EFFECTIVE_DATE} · Applies to ${PRODUCT}.`,
    meta: [
      { label: "Operator", value: OPERATOR },
      { label: "Full policy", value: "[Privacy Policy](/privacy)" },
    ],
    summary: [
      {
        title: "Stored on device",
        text: "Progress, coins, hearts, boosters and settings never leave your phone.",
      },
      {
        title: "Advertising",
        text: "Delivered by Unity LevelPlay, which may process device identifiers.",
      },
      {
        title: "Your controls",
        text: "Uninstall, or reset your advertising ID, to stop collection.",
      },
    ],
    sections: [
      {
        kind: "p",
        text: "A concise overview of device data, advertising and the controls available to you.",
      },
      { kind: "h3", text: "1. Data on your device" },
      {
        kind: "p",
        text: `Progress, coins, hearts, boosters and settings are stored **only locally on your device**. ${OPERATOR} does not operate a server that receives this data. Clearing app data or uninstalling the game removes the local save, subject to operating-system and backup behaviour.`,
      },
      { kind: "h3", text: "2. Advertising" },
      {
        kind: "p",
        text: "Advertising is delivered through **Unity LevelPlay**, including Unity Ads and Yandex Mobile Ads; the Yandex adapter also bundles AppMetrica analytics. Advertising SDKs may process advertising identifiers, technical device information, IP address, impressions and ad interactions under their own policies. AppLovin may be added in a future update.",
      },
      { kind: "h3", text: "3. Your rights and controls" },
      {
        kind: "ul",
        items: [
          "Uninstalling the game stops further collection by the game.",
          "To opt out of personalised ads, use Android → Privacy → Ads → “Delete advertising ID”. The game itself contains no consent dialog.",
          `Access, correction, deletion and consent-withdrawal requests: **${LEGAL_CONTACT}**.`,
        ],
      },
      { kind: "h3", text: "4. Children" },
      {
        kind: "p",
        text: "The game is not directed at children. Personalised advertising to users below the applicable age of digital consent is shown only where verifiable parental consent is available; otherwise non-personalised advertising is used.",
      },
      {
        kind: "callout",
        title: "Full document",
        text: "Detailed data categories, providers and processing information are available in the [Privacy Policy](/privacy).",
      },
    ],
  },
];

export function getLegalDoc(slug: string) {
  return legalDocs.find((d) => d.slug === slug);
}