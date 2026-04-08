# Phase 9: Pre-Beta Polish - Research

**Researched:** 2026-04-08
**Domain:** Expo/React Native UI polish — onboarding flows, form rework, tabbed history, keyboard/navigation bugs
**Confidence:** HIGH

## Summary

Phase 9 transforms BolusBrain from a developer-facing app into a beta-ready product. The work spans six distinct areas: (1) a 3-screen onboarding flow inserting Data Sharing consent and About Me demographics before the existing Equipment screen, (2) reworking the hypo treatment sheet to use presets with free-text and optional brand/amount fields, (3) adding a multi-tablet dosing section in Settings, (4) splitting the History page into two tabs (meals/rapid insulin vs long-acting insulin with 12-hour glucose curves), (5) updating Help & FAQ copy for anonymised data sharing, and (6) fixing keyboard obscuring save buttons and the white flash on home navigation transitions.

The codebase is well-structured with clear patterns established over Phases 1-8. The onboarding gate already exists in App.tsx (checking `equipment_changelog` in AsyncStorage) and uses `navigation.replace()` to prevent back-navigation. New screens slot in before EquipmentOnboarding using the same gate + replace pattern. All data is AsyncStorage-only — no Supabase. The GlucoseChart component is custom SVG (react-native-svg), not a third-party chart library, so the long-acting history tab can reuse it directly for 12-hour curves.

**Primary recommendation:** Extend the existing onboarding gate in App.tsx to check three sequential flags (data_sharing_completed, about_me_completed, equipment_changelog). Build the About Me screen following EquipmentOnboardingScreen's picker-modal pattern. For history tabs, use a simple custom tab bar (two Pressable buttons with underline indicator) — no additional library needed. Fix the white flash by setting a custom dark theme on NavigationContainer and standardise screen backgrounds to COLORS.background.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Screen 1: Data Sharing Opt-In — full-screen accept/decline page shown before anything else. Same consent content as existing Settings toggle. Settings toggle stays as-is for changing preference later.
- Screen 2: About Me (NEW) — Age range dropdown: 0-18, 18-25, 26-35, 36-45, 46-55, 56-65, 65+. Gender: Male / Female / Non-binary / Prefer not to say. T1D duration: <1 year, 1-5 years, 5-10 years, 10-20 years, 20+ years (OPTIONAL). HbA1c (mmol/mol): free number input (OPTIONAL). Can prompt for missing fields later via in-app reminder.
- Screen 3: Equipment (existing EquipmentOnboardingScreen, unchanged)
- Navigation: Data Sharing -> About Me -> Equipment -> Home (same gate pattern as current equipment-only onboarding)
- Hypo Treatment Rework: Presets shown as suggestions (Glucose tablets, Juice, Sweets, Gel, Other) WITH open text box to type freely. When preset selected -> ask brand (free text input, NOT mandatory). Amount field OPTIONAL — not required to save. Single item save (no multi-select). Brand field is also optional.
- Tablet Dosing (Settings): New section under Settings > Dosing area. Generic "add any tablet" feature — name, mg, amount per day (side by side on same row). Support multiple tablet types. Stored in AsyncStorage.
- History Page — Two Tabs: Tab 1: Meals + rapid insulin (existing view, unchanged). Tab 2: Long-acting insulin — list of doses with 12-hour glucose curve (from dose time to +12hrs), show dose units alongside curve, highlight morning reading.
- Help & FAQ Copy Update: Update data sharing section: if they opt in, data is fully anonymised and used to help improve diabetes care.
- Bug Fixes: Keyboard glitchiness on save buttons across all screens (KeyboardAvoidingView improvements). Home button white flash on navigation transitions (background colour fix).

### Claude's Discretion
- AsyncStorage key naming for user profile and tablet dosing data
- Specific KeyboardAvoidingView configuration per screen
- Tab component library choice for history page (or custom tabs)
- Layout of long-acting insulin tab entries
- Navigation transition background colour implementation

### Deferred Ideas (OUT OF SCOPE)
- Sign in / auth with Face ID / fingerprint -> Supabase phase
- Change password in Account settings -> Supabase phase
- Server-side data sharing enforcement (when user turns off toggle, stop sharing for that user) -> Supabase phase
- In-app reminder to complete optional About Me fields -> future phase
</user_constraints>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-native | 0.81.5 | Framework | Already in project |
| expo | ~54.0.0 | SDK | Already in project |
| @react-navigation/native | 7.1.33 | Navigation | Already in project, gate pattern established |
| @react-navigation/native-stack | 7.14.4 | Stack navigator | Already in project |
| @react-native-async-storage/async-storage | 2.2.0 | Local storage | Only storage backend (no Supabase) |
| react-native-svg | 15.12.1 | Charts | GlucoseChart already uses this for SVG line charts |
| react-native-safe-area-context | ~5.6.0 | Safe areas | Already used in onboarding screen |

### Supporting (no new installs needed)
This phase requires NO new dependencies. All functionality is built with existing libraries:
- Tab bar for history: custom component using Pressable + View (2 tabs only, not worth a library)
- Picker modals: existing FlatList + Modal pattern (EquipmentOnboardingScreen, SettingsScreen)
- Keyboard handling: React Native's built-in KeyboardAvoidingView

**Installation:** None required. Zero new dependencies.

## Architecture Patterns

### Recommended Project Structure (new files)
```
src/
├── screens/
│   ├── DataSharingOnboardingScreen.tsx   # NEW — Screen 1 of onboarding
│   ├── AboutMeOnboardingScreen.tsx       # NEW — Screen 2 of onboarding
│   ├── EquipmentOnboardingScreen.tsx     # EXISTING — Screen 3 (unchanged)
│   └── MealHistoryScreen.tsx             # MODIFIED — add tab bar
├── types/
│   └── equipment.ts                      # MODIFIED — add UserProfile interface
├── services/
│   └── storage.ts                        # MODIFIED — add user profile + tablet dosing helpers
└── components/
    └── HypoTreatmentSheet.tsx            # MODIFIED — rework per new spec
```

### Pattern 1: Multi-Screen Onboarding Gate
**What:** The current App.tsx checks `equipment_changelog` in AsyncStorage to decide whether to show EquipmentOnboarding or Home. Extend this to check three sequential completion flags.
**When to use:** First launch and any fresh install/storage clear.
**Implementation approach:**

The gate logic in App.tsx currently works like this:
```typescript
// Current (App.tsx line 64-71)
AsyncStorage.getItem('equipment_changelog')
  .then(raw => {
    const entries = raw ? JSON.parse(raw) : [];
    setNeedsOnboarding(!Array.isArray(entries) || entries.length === 0);
  })
  .catch(() => setNeedsOnboarding(true))
  .finally(() => setGateChecked(true));
```

**Extend to check three flags in sequence:**
1. `data_sharing_onboarding_completed` — set to `"true"` after Data Sharing screen
2. `about_me_completed` — set to `"true"` after About Me screen
3. `equipment_changelog` — existing check (array length > 0)

The initial route is determined by the first incomplete step. Each screen calls `navigation.replace()` to move to the next screen (same pattern as current EquipmentOnboarding -> Home).

**New RootStackParamList entries:**
```typescript
export type RootStackParamList = {
  DataSharingOnboarding: undefined;  // NEW
  AboutMeOnboarding: undefined;       // NEW
  EquipmentOnboarding: undefined;     // existing
  Home: undefined;
  // ... rest unchanged
};
```

### Pattern 2: AsyncStorage Key Naming (Claude's Discretion)
**Recommendation:** Use consistent snake_case prefixed keys:
| Key | Purpose | Value Type |
|-----|---------|------------|
| `data_sharing_onboarding_completed` | Gate flag for onboarding screen 1 | `"true"` or absent |
| `about_me_completed` | Gate flag for onboarding screen 2 | `"true"` or absent |
| `user_profile` | About Me demographic data | JSON: `UserProfile` |
| `tablet_dosing` | Array of tablet configurations | JSON: `TabletDosing[]` |
| `data_consent` | Existing consent toggle | JSON: `DataConsent` (unchanged) |
| `equipment_changelog` | Existing equipment data | JSON: `EquipmentChangeEntry[]` (unchanged) |

### Pattern 3: Custom Tab Bar for History (Claude's Discretion)
**What:** A simple two-tab bar component using Pressable, not a library.
**Why not a library:** Only 2 tabs. react-native-tab-view or @react-navigation/material-top-tabs add ~40KB+ for something achievable in ~30 lines of JSX. The project has no tab libraries installed and this follows the project's pattern of minimal dependencies.
**Implementation:**
```typescript
// Inline in MealHistoryScreen.tsx — two Pressable buttons with animated underline
function TabBar({ activeTab, onTabChange }: { activeTab: 0 | 1; onTabChange: (tab: 0 | 1) => void }) {
  return (
    <View style={tabStyles.container}>
      <Pressable
        style={[tabStyles.tab, activeTab === 0 && tabStyles.activeTab]}
        onPress={() => onTabChange(0)}
      >
        <Text style={[tabStyles.tabText, activeTab === 0 && tabStyles.activeTabText]}>
          Meals
        </Text>
      </Pressable>
      <Pressable
        style={[tabStyles.tab, activeTab === 1 && tabStyles.activeTab]}
        onPress={() => onTabChange(1)}
      >
        <Text style={[tabStyles.tabText, activeTab === 1 && tabStyles.activeTabText]}>
          Long-acting
        </Text>
      </Pressable>
    </View>
  );
}
```
The tab bar sits at the top of MealHistoryScreen. Tab 0 renders existing FlatList content (meals + rapid insulin + hypo treatments). Tab 1 renders a filtered list of long-acting insulin logs only, each with its GlucoseChart.

### Pattern 4: UserProfile Type
**What:** New interface for About Me demographic data.
```typescript
// In src/types/equipment.ts (extends existing type file)
export interface UserProfile {
  age_range: string;        // "0-18" | "18-25" | "26-35" | "36-45" | "46-55" | "56-65" | "65+"
  gender: string;           // "Male" | "Female" | "Non-binary" | "Prefer not to say"
  t1d_duration?: string;    // "<1 year" | "1-5 years" | "5-10 years" | "10-20 years" | "20+" (optional)
  hba1c_mmol_mol?: number;  // free number input (optional)
  completed_at: string;     // ISO timestamp
}
```

### Pattern 5: TabletDosing Type
**What:** New interface for multiple tablet configurations.
```typescript
// In src/types/equipment.ts or src/services/settings.ts
export interface TabletDosing {
  id: string;         // generated with Date.now()-random pattern
  name: string;       // e.g. "Metformin"
  mg: string;         // e.g. "500"
  amount_per_day: string; // e.g. "2"
}
```
**Note:** The existing `AppSettings` has `tabletName` and `tabletDose` as single strings. The new multi-tablet system replaces this. Consider migration: if `tabletName` is non-empty, create a single TabletDosing entry from the legacy data.

### Anti-Patterns to Avoid
- **DO NOT import Supabase** — the integration was reverted (commit 23df7b5). All storage is AsyncStorage-only.
- **DO NOT use `crypto.randomUUID()`** — it does not work in React Native. Use `${Date.now()}-${Math.random().toString(36).slice(2, 11)}` (see `generateId()` in storage.ts).
- **DO NOT use `navigation.navigate()` between onboarding screens** — use `navigation.replace()` to prevent back-navigation to previous onboarding steps (established pattern from Phase 8).
- **DO NOT use COLORS.textPrimary** — it does not exist in theme.ts. Use `COLORS.text` instead (Phase 8 decision).
- **DO NOT mix `#000` and `COLORS.background` (#050706)** — the mismatch between screen backgrounds (`#000`) and navigator contentStyle (`#050706`) likely contributes to the white flash. Standardise all to `COLORS.background`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ID generation | UUID library | `${Date.now()}-${Math.random().toString(36).slice(2, 11)}` | crypto.randomUUID() broken in RN; pattern established in storage.ts |
| Keyboard avoidance | Custom keyboard listener | React Native's `KeyboardAvoidingView` with correct per-platform behavior prop | Built-in, tested, sufficient for this app's forms |
| Chart rendering | New chart library | Existing `GlucoseChart` component (react-native-svg) | Already built, handles reference lines, colour coding, time labels |
| Navigation theming | Per-screen background hacks | `NavigationContainer theme` prop with custom dark theme | Fixes white flash at root level; official React Navigation approach |

**Key insight:** This phase is purely UI rework and new screens using patterns already established in the codebase. No new libraries, no new architectural patterns.

## Common Pitfalls

### Pitfall 1: Onboarding Gate Race Condition
**What goes wrong:** If the three AsyncStorage checks are done independently, there's a brief period where the app might flash the wrong initial route.
**Why it happens:** AsyncStorage reads are async. The current pattern sets `gateChecked` only after the single check completes, preventing NavigationContainer render until resolved.
**How to avoid:** Keep the same `gateChecked` pattern but check all three flags in a single async function before setting `gateChecked = true`. Determine the `initialRouteName` based on the first incomplete flag.
**Warning signs:** Flash of Home screen before onboarding, or flash of Equipment screen before Data Sharing.

### Pitfall 2: White Flash on Navigation (Background Mismatch)
**What goes wrong:** A brief white flash appears when navigating between screens, especially noticeable on dark OLED screens.
**Why it happens:** Two causes identified in the codebase:
1. **Theme gap:** `NavigationContainer` has no `theme` prop set. React Navigation defaults to a white background theme. The `contentStyle: { backgroundColor: '#050706' }` on `screenOptions` partially fixes this but doesn't cover the navigator container itself.
2. **Background inconsistency:** Screens use `#000` while App.tsx uses `#050706` (COLORS.background). During transition animation, the mismatched colours may flash.
**How to avoid:**
1. Set a custom theme on NavigationContainer: `<NavigationContainer theme={{ dark: true, colors: { ...DefaultTheme.colors, background: '#050706', card: '#050706', text: '#FFFFFF', border: '#2C2C2E', primary: '#30D158', notification: '#FF3B30' } }}>`.
2. Change all screen root backgrounds from `#000` to `COLORS.background` (`#050706`).
**Warning signs:** Any screen using hardcoded `#000` instead of `COLORS.background`.

### Pitfall 3: KeyboardAvoidingView Inconsistency Across Screens
**What goes wrong:** Save buttons get hidden behind the keyboard on some screens but not others.
**Why it happens:** Different screens use different `behavior` prop values:
- HomeScreen: `behavior='padding'` on iOS, `'height'` on Android
- MealLogScreen: `behavior='padding'` on iOS, `undefined` on Android
- InsulinLogScreen: `behavior='padding'` on iOS, `undefined` on Android
- HypoTreatmentSheet: `behavior='padding'` on iOS, `'height'` on Android
- SettingsScreen: `behavior='padding'` on iOS, `undefined` on Android
**How to avoid:** Standardise all screens to the same pattern. For screens with ScrollView children: `behavior={Platform.OS === 'ios' ? 'padding' : undefined}` with `keyboardShouldPersistTaps="handled"` on the ScrollView. For modal sheets: `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`. Add `keyboardVerticalOffset` on iOS to account for the header bar height (typically 88-100 for native stack navigator headers).
**Warning signs:** Test every screen with a TextInput by tapping the input, then checking if the save button is still visible and tappable.

### Pitfall 4: Hypo Treatment Rework — Breaking Existing Data
**What goes wrong:** The HypoTreatment interface changes (brand field added, amount_value becomes optional) could break existing saved treatments.
**Why it happens:** Existing HypoTreatment records in AsyncStorage have `amount_value` as required. New records may omit it. Loading old records with new code (or vice versa) could cause type errors.
**How to avoid:** Make `amount_value` and `brand` optional in the interface. Existing records have `amount_value` populated, so they'll still work. New records without amount will have `amount_value: undefined`. The display code must handle undefined amounts gracefully.
**Warning signs:** Crashes when viewing history after the update, or when saving a new hypo treatment without amount.

### Pitfall 5: Tablet Dosing Migration from Single to Multiple
**What goes wrong:** The existing `AppSettings` has `tabletName` and `tabletDose` as single strings. The new multi-tablet system replaces this, but existing data in `glucolog_settings` still has the old fields.
**Why it happens:** Settings already stored under `glucolog_settings` key won't automatically migrate.
**How to avoid:** On first load of tablet dosing, check if `glucolog_settings` has non-empty `tabletName`/`tabletDose`. If so, create a single `TabletDosing` entry from the legacy data and save it to the new `tablet_dosing` key. Clear the legacy fields from settings to avoid confusion.
**Warning signs:** User's previously saved tablet info disappearing after update.

### Pitfall 6: History Tab Losing Scroll Position
**What goes wrong:** Switching between Meals tab and Long-acting tab resets scroll position.
**Why it happens:** If implemented with conditional rendering (showing/hiding FlatLists), the hidden FlatList's state is lost.
**How to avoid:** Either: (a) use `display: 'none'` / `display: 'flex'` to hide/show without unmounting, or (b) accept the reset since the lists are short enough that it's not a major UX issue. Option (a) is cleaner.
**Warning signs:** User scrolls down in meals tab, switches to long-acting, switches back, and loses their position.

## Code Examples

### Data Sharing Onboarding Screen Pattern
```typescript
// Follows EquipmentOnboardingScreen's full-screen pattern
// Key difference: two buttons (Accept/Decline) instead of a form
// Uses same COLORS, FONTS, and navigation.replace() pattern

export default function DataSharingOnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  async function handleAccept() {
    // Save consent using same DataConsent interface from Phase 8
    const consent: DataConsent = {
      consented: true,
      consented_at: new Date().toISOString(),
      version: CURRENT_CONSENT_VERSION,
    };
    await AsyncStorage.setItem('data_consent', JSON.stringify(consent));
    await AsyncStorage.setItem('data_sharing_onboarding_completed', 'true');
    navigation.replace('AboutMeOnboarding');
  }

  async function handleDecline() {
    // Still mark as completed — user can opt in later via Settings
    const consent: DataConsent = {
      consented: false,
      version: CURRENT_CONSENT_VERSION,
    };
    await AsyncStorage.setItem('data_consent', JSON.stringify(consent));
    await AsyncStorage.setItem('data_sharing_onboarding_completed', 'true');
    navigation.replace('AboutMeOnboarding');
  }
  // ...
}
```

### About Me Screen — Picker-Modal Pattern
```typescript
// Reuses EquipmentOnboardingScreen's FlatList+Modal picker pattern
// Age range and Gender are MANDATORY — gate the Continue button
// T1D duration is OPTIONAL (skip allowed)
// HbA1c is free-text numeric input (optional)

const AGE_RANGES = ['0-18', '18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const T1D_DURATIONS = ['<1 year', '1-5 years', '5-10 years', '10-20 years', '20+'];

// canContinue requires ageRange !== null && gender !== null
// (t1d_duration and hba1c are optional)
```

### Onboarding Gate Extension in App.tsx
```typescript
// Replace the single equipment_changelog check with sequential gate
useEffect(() => {
  async function checkOnboarding() {
    try {
      const dsCompleted = await AsyncStorage.getItem('data_sharing_onboarding_completed');
      if (dsCompleted !== 'true') {
        setInitialRoute('DataSharingOnboarding');
        setGateChecked(true);
        return;
      }
      const amCompleted = await AsyncStorage.getItem('about_me_completed');
      if (amCompleted !== 'true') {
        setInitialRoute('AboutMeOnboarding');
        setGateChecked(true);
        return;
      }
      const equipRaw = await AsyncStorage.getItem('equipment_changelog');
      const entries = equipRaw ? JSON.parse(equipRaw) : [];
      if (!Array.isArray(entries) || entries.length === 0) {
        setInitialRoute('EquipmentOnboarding');
        setGateChecked(true);
        return;
      }
      setInitialRoute('Home');
    } catch {
      setInitialRoute('DataSharingOnboarding');
    } finally {
      setGateChecked(true);
    }
  }
  checkOnboarding();
}, []);
```

### Hypo Treatment Rework — Updated Interface
```typescript
// HypoTreatment changes in src/types/equipment.ts:
export interface HypoTreatment {
  id: string;
  logged_at: string;
  glucose_at_event: number;
  treatment_type: string;             // Preset selection OR free text
  brand?: string;                     // NEW — optional brand free-text
  amount_value?: number;              // CHANGED from required to optional
  amount_unit?: 'tablets' | 'ml' | 'g' | 'food'; // CHANGED from required to optional
  notes?: string;
  insulin_brand?: string;
  glucose_readings_after?: number[];
}
```

### White Flash Fix — NavigationContainer Theme
```typescript
// In App.tsx — create a custom dark theme
import { DefaultTheme } from '@react-navigation/native';

const DarkTheme = {
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: COLORS.background,    // '#050706'
    card: COLORS.background,
    text: COLORS.text,                // '#FFFFFF'
    border: COLORS.separator,         // '#2C2C2E'
    primary: COLORS.green,            // '#30D158'
    notification: COLORS.red,         // '#FF3B30'
  },
  fonts: DefaultTheme.fonts,
};

// Apply:
<NavigationContainer theme={DarkTheme}>
```

### TabletDosing — Settings Section
```typescript
// Inline in SettingsScreen.tsx, under the existing Dosing section
// Each tablet row: [Name input] [mg input] [x/day input] [Delete button]
// "Add tablet" button at the bottom
// Stored in AsyncStorage under 'tablet_dosing' key

function TabletRow({ tablet, onUpdate, onDelete }: {
  tablet: TabletDosing;
  onUpdate: (id: string, changes: Partial<TabletDosing>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View style={styles.tabletRow}>
      <TextInput
        style={[styles.tabletInput, { flex: 2 }]}
        value={tablet.name}
        onChangeText={v => onUpdate(tablet.id, { name: v })}
        placeholder="Tablet name"
        placeholderTextColor={COLORS.textMuted}
      />
      <TextInput
        style={[styles.tabletInput, { flex: 1 }]}
        value={tablet.mg}
        onChangeText={v => onUpdate(tablet.id, { mg: v })}
        placeholder="mg"
        placeholderTextColor={COLORS.textMuted}
        keyboardType="decimal-pad"
      />
      <TextInput
        style={[styles.tabletInput, { flex: 1 }]}
        value={tablet.amount_per_day}
        onChangeText={v => onUpdate(tablet.id, { amount_per_day: v })}
        placeholder="x/day"
        placeholderTextColor={COLORS.textMuted}
        keyboardType="decimal-pad"
      />
      <Pressable onPress={() => onDelete(tablet.id)} hitSlop={8}>
        <Text style={{ color: COLORS.red, fontSize: 16 }}>X</Text>
      </Pressable>
    </View>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single equipment_changelog gate | Multi-step onboarding gate (3 screens) | Phase 9 | App.tsx initialRoute logic changes |
| Single tabletName + tabletDose strings | Array of TabletDosing objects | Phase 9 | Settings storage model changes, migration needed |
| Flat MealHistoryScreen | Tabbed view (Meals + Long-acting) | Phase 9 | History UX restructured |
| Required amount in HypoTreatment | Optional amount + optional brand | Phase 9 | Interface change, backward-compatible if handled |

**Deprecated/outdated:**
- `AppSettings.tabletName` and `AppSettings.tabletDose`: replaced by `tablet_dosing` array in AsyncStorage. Should be migrated and then ignored.

## Open Questions

1. **Existing users upgrading to Phase 9**
   - What we know: Existing users have completed equipment onboarding. They have `equipment_changelog` in AsyncStorage.
   - What's unclear: Should existing users be forced through Data Sharing + About Me screens on next launch? Or should they be grandfathered in and see these only in Settings?
   - Recommendation: YES, show the new screens to existing users. The gate should check all three flags. If `data_sharing_onboarding_completed` is absent, the user sees Data Sharing first regardless of whether they already have equipment data. This ensures all beta testers have demographic data captured.

2. **Long-acting insulin tab — "highlight morning reading"**
   - What we know: The CONTEXT.md says "highlight morning reading" on the long-acting tab.
   - What's unclear: Definition of "morning reading" — is it the closest reading to 7am the next day? Or the first reading after waking?
   - Recommendation: Use the reading closest to 7:00 AM the day after the dose (same logic as PATT-04 requirement for overnight window). Highlight it with a distinct color/badge in the curve display.

3. **HypoTreatment backward compatibility**
   - What we know: Existing treatments have amount_value as a required number.
   - What's unclear: Whether to modify the interface to make amount_value optional or keep it required with a sentinel value.
   - Recommendation: Make `amount_value` and `amount_unit` optional in the TypeScript interface. Existing records will still have these fields populated. New records may omit them. Display code should show "Not recorded" or similar when amount is undefined.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + jest-expo 54.0.17 |
| Config file | `package.json` (jest section) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| P9-01 | Onboarding gate checks 3 flags sequentially | unit | `npm test -- --testPathPattern="onboardingGate"` | No — Wave 0 |
| P9-02 | UserProfile type validates mandatory fields (age_range, gender) | unit | `npm test -- --testPathPattern="userProfile"` | No — Wave 0 |
| P9-03 | Hypo treatment saves with optional amount/brand | unit | `npm test -- --testPathPattern="hypoTreatment"` | No — Wave 0 |
| P9-04 | TabletDosing CRUD operations | unit | `npm test -- --testPathPattern="tabletDosing"` | No — Wave 0 |
| P9-05 | Long-acting insulin list filters correctly | unit | `npm test -- --testPathPattern="longActingHistory"` | No — Wave 0 |
| P9-06 | Tablet migration from single to multi | unit | `npm test -- --testPathPattern="tabletMigration"` | No — Wave 0 |
| P9-07 | Help FAQ contains anonymised data sharing copy | manual-only | Visual inspection | N/A |
| P9-08 | Keyboard does not obscure save buttons | manual-only | Device testing | N/A |
| P9-09 | No white flash on home navigation | manual-only | Device testing | N/A |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/onboardingGate.test.ts` — covers P9-01 (gate logic as pure function)
- [ ] `src/__tests__/userProfile.test.ts` — covers P9-02 (validation of mandatory fields)
- [ ] `src/__tests__/tabletDosing.test.ts` — covers P9-04, P9-06 (CRUD + migration)

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** — App.tsx, EquipmentOnboardingScreen.tsx, HypoTreatmentSheet.tsx, MealHistoryScreen.tsx, SettingsScreen.tsx, HelpScreen.tsx, storage.ts, settings.ts, types/equipment.ts, theme.ts, components/types.ts, GlucoseChart.tsx, HomeScreen.tsx, package.json — all read directly
- [React Navigation Themes docs](https://reactnavigation.org/docs/themes/) — custom theme configuration for dark mode
- [React Native KeyboardAvoidingView docs](https://reactnative.dev/docs/keyboardavoidingview) — behavior prop, keyboardVerticalOffset
- [Expo Keyboard Handling guide](https://docs.expo.dev/guides/keyboard-handling/) — platform-specific configuration

### Secondary (MEDIUM confidence)
- [GitHub: react-native-screens #380 — White flash with DarkTheme](https://github.com/software-mansion/react-native-screens/issues/380) — confirmed NavigationContainer theme as the fix
- [GitHub: react-navigation #9784 — Flash of white on initial render](https://github.com/react-navigation/react-navigation/issues/9784) — confirms contentStyle alone is not sufficient
- [Fixing Flashes of White in React Navigation](https://oscarg.ws/fixing-flashes-of-white-in-react-navigation) — practical walkthrough of theme-based fix

### Tertiary (LOW confidence)
- None — all findings verified against codebase or official docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all patterns established in codebase
- Architecture: HIGH — extending existing gate pattern, reusing existing UI patterns
- Pitfalls: HIGH — identified from direct codebase analysis (background colour mismatch, KAV inconsistencies, data migration needs)

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable — no fast-moving dependencies)
