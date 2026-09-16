import { redirect } from "next/navigation";

/** The pages tab is the CMS landing screen. */
export default function AdminCmsPagesRedirect() {
  redirect("/admin/cms");
}
