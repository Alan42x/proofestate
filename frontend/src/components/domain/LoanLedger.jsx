import { CircleDollarSign } from "lucide-react";
import { DataTable } from "../common/DataTable";

export function LoanLedger({
  t,
  title,
  loans,
  loading,
  emptyText,
  columns,
  rowKey,
  selectLoanRecord,
  selectedLoanId
}) {
  const rows = loans.map((loan) => ({
    ...loan,
    active: selectedLoanId === loan.id.toString(),
    onSelect: selectLoanRecord ? () => selectLoanRecord(loan) : undefined
  }));

  return (
    <article className="loan-table-card panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <CircleDollarSign size={16} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        loading={loading}
        loadingText={t("loading")}
        emptyText={emptyText}
        className={columns.length > 5 ? "my-loan-row" : ""}
      />
    </article>
  );
}
