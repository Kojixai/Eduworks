/** Children's Code (standard 11): tell the child, in plain words, that their grown-up can see their scores. */
export function GrownUpNote({ name }: { name?: string }) {
  return (
    <p className="small muted" style={{ margin: "12px 0 0" }} data-testid="grownup-note">
      {name ? `${name}, y` : "Y"}our grown-up can see your scores on their dashboard. That is so they can help you.
    </p>
  );
}
