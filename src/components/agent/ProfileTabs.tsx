"use client";

import { Tabs } from "@/components/ui/Navigation";

/** Profile | Security tab bar shared by /agent/profile and /agent/security (prototype V.profile split in two). */
export function ProfileTabs({ active }: { active: "profile" | "security" }) {
  return (
    <Tabs
      label="Profile and security"
      active={active}
      items={[
        { key: "profile", label: "Profile", href: "/agent/profile" },
        { key: "security", label: "Security", href: "/agent/security" },
      ]}
    />
  );
}
