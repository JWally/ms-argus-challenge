export const REQUIRED_DRAWINGS = 3;

export function shouldShowDrawingInstructions(index: number, hasStarted: boolean): boolean {
  return index === 0 && !hasStarted;
}
