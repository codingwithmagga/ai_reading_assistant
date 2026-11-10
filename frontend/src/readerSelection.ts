export function getSelectionParagraph(
  selection: Selection | null,
  container: HTMLElement | null,
): HTMLElement | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const parent = range.commonAncestorContainer;
  const paragraph =
    parent instanceof Element
      ? parent.closest<HTMLElement>("[data-reading-position]")
      : parent.nodeType === Node.ELEMENT_NODE
        ? (parent as Element).closest<HTMLElement>("[data-reading-position]")
        : parent.parentElement?.closest<HTMLElement>("[data-reading-position]");

  if (!paragraph || !container || !container.contains(paragraph)) {
    return null;
  }

  return paragraph;
}
