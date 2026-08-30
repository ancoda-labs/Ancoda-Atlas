/**
 * CSS transform that undoes an EXIF orientation tag.
 *
 * Stored flood photos have EXIF stripped, so the browser cannot right them
 * on its own. The 1–8 value is kept in the database and applied here.
 * Lives in its own module so client components do not import image.ts
 * (that file walks Buffers).
 */
export function orientationTransform(orientation: number): string | undefined {
  switch (orientation) {
    case 2: return 'scaleX(-1)';
    case 3: return 'rotate(180deg)';
    case 4: return 'scaleX(-1) rotate(180deg)';
    case 5: return 'scaleX(-1) rotate(90deg)';
    case 6: return 'rotate(90deg)';
    case 7: return 'scaleX(-1) rotate(270deg)';
    case 8: return 'rotate(270deg)';
    default: return undefined;
  }
}
