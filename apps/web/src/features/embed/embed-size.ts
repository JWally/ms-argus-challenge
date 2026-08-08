interface MeasurableEmbedElement {
  getBoundingClientRect(): { height: number };
}

export function measuredEmbedHeight(element: MeasurableEmbedElement): number {
  return Math.ceil(element.getBoundingClientRect().height);
}
