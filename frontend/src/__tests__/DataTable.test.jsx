import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, DetailList } from "../components/common/DataTable";

describe("DataTable", () => {
  const columns = [
    { key: "id", label: "Loan ID", strong: true, render: (row) => `#${row.id}` },
    { key: "state", label: "State" }
  ];

  it("renders loading and empty states consistently", () => {
    const { rerender } = render(
      <DataTable columns={columns} rows={[]} rowKey={(row) => row.id} loading loadingText="Loading" emptyText="Empty" />
    );
    expect(screen.getByText("Loading")).toBeInTheDocument();

    rerender(<DataTable columns={columns} rows={[]} rowKey={(row) => row.id} loading={false} loadingText="Loading" emptyText="Empty" />);
    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  it("supports selectable ledger rows", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DataTable
        columns={columns}
        rows={[{ id: 1, state: "Requested", onSelect }]}
        rowKey={(row) => row.id}
        loadingText="Loading"
        emptyText="Empty"
      />
    );

    await user.click(screen.getByRole("button", { name: /#1 requested/i }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("DetailList", () => {
  it("renders label-value audit details", () => {
    render(<DetailList items={[{ label: "Borrower", value: "0x123" }]} />);
    expect(screen.getByText("Borrower")).toBeInTheDocument();
    expect(screen.getByText("0x123")).toBeInTheDocument();
  });
});
