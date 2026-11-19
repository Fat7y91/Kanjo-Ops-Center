let activeLocks = 0;

/** Reference-counted body scroll lock shared by every overlay. */
export function lockBodyScroll(): void {
  activeLocks += 1;
  document.body.style.overflow = "hidden";
}

export function unlockBodyScroll(): void {
  activeLocks = Math.max(0, activeLocks - 1);
  if (activeLocks > 0) return;
  document.body.style.overflow = "";
  document.body.style.pointerEvents = "";
}
