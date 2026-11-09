import { describe, expect, it } from "vitest";
import { buildTourSteps, claimTourForSession, tourGroupTarget, type TourGroup, type TourStore } from "@/lib/admin-tour";

function memoryStore(initial: Record<string, string> = {}): TourStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

const superAdminMenu: TourGroup[] = [
  { title: "Overview", links: [{ href: "/admin", label: "Dashboard" }] },
  { title: "People", links: [{ href: "/admin/users", label: "Users and roles" }, { href: "/admin/tutors", label: "Tutors" }] },
  { title: "System", links: [{ href: "/admin/audit", label: "Audit log" }] },
];

describe("buildTourSteps", () => {
  it("opens with a welcome, points at the menu, then covers each group, the account area and ends", () => {
    const steps = buildTourSteps(superAdminMenu, "Abel");
    expect(steps.map((s) => s.id)).toEqual(["welcome", "menu", "group-overview", "group-people", "group-system", "account", "done"]);
    expect(steps[0]!.title).toBe("Welcome, Abel");
    expect(steps[0]!.target).toBeUndefined();
    expect(steps[1]!.target).toBe("nav");
    expect(steps.at(-1)!.target).toBeUndefined();
  });

  it("describes only the areas the person can see", () => {
    const limited: TourGroup[] = [
      { title: "Overview", links: [{ href: "/admin", label: "Dashboard" }] },
      { title: "Marketplace", links: [{ href: "/admin/orders", label: "Orders" }] },
    ];
    const steps = buildTourSteps(limited, "Esi");
    const text = JSON.stringify(steps);
    expect(text).toContain("Orders");
    expect(text).not.toContain("Audit log");
    expect(text).not.toContain("Users and roles");
    expect(steps.find((s) => s.id === "group-people")).toBeUndefined();
  });

  it("gives every menu link a step item with real text, and each group step its own target", () => {
    const steps = buildTourSteps(superAdminMenu, "Abel");
    const people = steps.find((s) => s.id === "group-people")!;
    expect(people.items?.map((i) => i.label)).toEqual(["Users and roles", "Tutors"]);
    expect(people.items?.every((i) => i.text.length > 20)).toBe(true);
    for (const g of superAdminMenu) expect(steps.find((s) => s.target === tourGroupTarget(g.title))).toBeTruthy();
  });

  it("leaves an area out of the list rather than showing an empty line when it has no description", () => {
    const steps = buildTourSteps([{ title: "Other", links: [{ href: "/admin/unknown", label: "Mystery" }] }], "A");
    expect(steps.find((s) => s.id === "group-other")!.items).toEqual([]);
  });

  it("handles a missing first name and tells phone users where the menu is", () => {
    const steps = buildTourSteps(superAdminMenu, "  ");
    expect(steps[0]!.title).toBe("Welcome");
    expect(steps[1]!.compactHint).toMatch(/Menu/);
  });

  it("makes safe, stable group targets", () => {
    expect(tourGroupTarget("People")).toBe("group-people");
    expect(tourGroupTarget("Creators & Payouts!")).toBe("group-creators-payouts");
  });
});

describe("claimTourForSession", () => {
  it("shows the tour once for a sign-in, not again on a reload or another page", () => {
    const store = memoryStore();
    expect(claimTourForSession(store, "aaaa")).toBe(true);
    expect(claimTourForSession(store, "aaaa")).toBe(false);
    expect(claimTourForSession(store, "aaaa")).toBe(false);
  });

  it("shows it again after the next sign-in, and forgets the earlier sign-in's key", () => {
    const store = memoryStore({ "unrelated-key": "keep" });
    expect(claimTourForSession(store, "first")).toBe(true);
    expect(claimTourForSession(store, "second")).toBe(true);
    expect(claimTourForSession(store, "second")).toBe(false);
    expect([...store.data.keys()].sort()).toEqual(["tmp-admin-tour:second", "unrelated-key"]);
  });

  it("does not crash or stay silent when browser storage is blocked", () => {
    expect(claimTourForSession(null, "x")).toBe(true);
    const broken: TourStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
      key: () => null,
      length: 0,
    };
    expect(claimTourForSession(broken, "x")).toBe(true);
  });
});
