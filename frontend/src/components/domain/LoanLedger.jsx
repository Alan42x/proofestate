import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CircleDollarSign } from "lucide-react";
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
  selectedLoanId,
  pageSize
}) {
  const [page, setPage] = useState(0);
  const totalPages = pageSize ? Math.max(1, Math.ceil(loans.length / pageSize)) : 1;
  const visibleLoans = useMemo(() => {
    if (!pageSize) return loans;
    return loans.slice(page * pageSize, page * pageSize + pageSize);
  }, [loans, page, pageSize]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const rows = visibleLoans.map((loan) => ({
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
      {pageSize && loans.length > pageSize && (
        <div className="ledger-pagination">
          <button className="icon-only" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>
            <ChevronLeft size={16} />
          </button>
          <span>{page + 1} / {totalPages}</span>
          <button
            className="icon-only"
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </article>
  );
}
