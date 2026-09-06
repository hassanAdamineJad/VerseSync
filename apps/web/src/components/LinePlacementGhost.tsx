type Props = {
  lineNumber: string;
  text: string;
  left: number;
  top: number;
};

export function LinePlacementGhost({ lineNumber, text, left, top }: Props) {
  return (
    <div
      className="line-placement-ghost"
      style={{ left, top }}
    >
      <span className="line-placement-ghost-index">{lineNumber}</span>
      <span className="line-placement-ghost-text">{text}</span>
    </div>
  );
}
