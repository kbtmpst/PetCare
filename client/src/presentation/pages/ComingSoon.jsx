import PageHeader from "../components/ui/PageHeader.jsx";
import Card from "../components/ui/Card.jsx";

// Temporary page used for routes that have not been built yet.
export default function ComingSoon({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="text-sm text-muted">
          This page is not built yet. It comes next in the build order.
        </p>
      </Card>
    </>
  );
}
