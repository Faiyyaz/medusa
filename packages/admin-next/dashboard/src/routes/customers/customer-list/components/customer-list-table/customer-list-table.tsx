import { PencilSquare } from "@medusajs/icons"
import { Customer } from "@medusajs/medusa"
import { Button, Container, Heading } from "@medusajs/ui"
import { ColumnDef, createColumnHelper } from "@tanstack/react-table"
import { useAdminCustomers } from "medusa-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { ActionMenu } from "../../../../../components/common/action-menu"
import { DataTable } from "../../../../../components/table/data-table"
import { useCustomerTableColumns } from "../../../../../hooks/table/columns/use-customer-table-columns"
import { useCustomerTableFilters } from "../../../../../hooks/table/filters/use-customer-table-filters"
import { useCustomerTableQuery } from "../../../../../hooks/table/query/use-customer-table-query"
import { useDataTable } from "../../../../../hooks/use-data-table"

const PAGE_SIZE = 20

export const CustomerListTable = () => {
  const { t } = useTranslation()

  const { searchParams, raw } = useCustomerTableQuery({ pageSize: PAGE_SIZE })
  const { customers, count, isLoading, isError, error } = useAdminCustomers(
    {
      ...searchParams,
    },
    {
      keepPreviousData: true,
    }
  )

  const filters = useCustomerTableFilters()
  const columns = useColumns()

  const { table } = useDataTable({
    data: customers ?? [],
    columns,
    count,
    enablePagination: true,
    getRowId: (row) => row.id,
    pageSize: PAGE_SIZE,
  })

  if (isError) {
    throw error
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading>{t("customers.domain")}</Heading>
        <Link to="/customers/create">
          <Button size="small" variant="secondary">
            {t("actions.create")}
          </Button>
        </Link>
      </div>
      <DataTable
        table={table}
        columns={columns}
        rowCount={PAGE_SIZE}
        count={count}
        filters={filters}
        orderBy={[
          "email",
          "first_name",
          "last_name",
          "has_account",
          "created_at",
          "updated_at",
        ]}
        isLoading={isLoading}
        navigateTo={(row) => row.original.id}
        search
        queryObject={raw}
      />
    </Container>
  )
}

const CustomerActions = ({ customer }: { customer: Customer }) => {
  const { t } = useTranslation()

  return (
    <ActionMenu
      groups={[
        {
          actions: [
            {
              icon: <PencilSquare />,
              label: t("actions.edit"),
              to: `/customers/${customer.id}/edit`,
            },
          ],
        },
      ]}
    />
  )
}

const columnHelper = createColumnHelper<Customer>()

const useColumns = () => {
  const columns = useCustomerTableColumns()

  return useMemo(
    () => [
      ...columns,
      columnHelper.display({
        id: "actions",
        cell: ({ row }) => <CustomerActions customer={row.original} />,
      }),
    ],
    [columns]
  ) as ColumnDef<Customer>[]
}
