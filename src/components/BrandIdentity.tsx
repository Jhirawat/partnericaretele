/** Use only a supplied original asset; no generated logo or licensing seal. */
export function BrandIdentity() {
  const logo = import.meta.env["VITE_DRTHAIKANYA_LOGO_URL"] as string | undefined;
  return (
    <span className="flex min-w-0 items-center gap-3">
      {logo && (logo.startsWith("/") || logo.startsWith("https://")) && (
        <img
          src={logo}
          alt="Dr.Thaikanya Telemedicine"
          width={48}
          height={48}
          decoding="async"
          className="h-12 w-12 shrink-0 object-contain"
        />
      )}
      <span className="min-w-0">
        <span className="block font-display text-base font-semibold leading-tight">iCareTele</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
          by Thaikanya Clinic
        </span>
      </span>
    </span>
  );
}

export function LicenseEvidence() {
  const entity = import.meta.env["VITE_DHSS_LICENSE_ENTITY"] as string | undefined;
  const number = import.meta.env["VITE_DHSS_LICENSE_NUMBER"] as string | undefined;
  const evidence = import.meta.env["VITE_DHSS_LICENSE_EVIDENCE_URL"] as string | undefined;
  if (
    !entity ||
    !number ||
    !evidence ||
    !(evidence.startsWith("/") || evidence.startsWith("https://"))
  )
    return null;
  return (
    <a
      href={evidence}
      className="text-sm underline underline-offset-4"
      target="_blank"
      rel="noreferrer"
    >
      DHSS · {entity} · {number}
    </a>
  );
}
