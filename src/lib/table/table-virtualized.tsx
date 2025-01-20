import { Row } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { TableComponent } from './components/table-component';
import { useReactTable } from './hooks/useReactTable';
import { ITableContainerProps as TableProps } from './table';

const DEFAULT_ESTIMATE_SIZE = 40;
const HEADER_SIZE = 50;

type Props<TData> = Omit<TableProps<TData>, 'page'> & {
    hasNextPage: boolean;
    estimateSize?: number;
    onBottomReached?(): void;
};

export const TableVirtualized = <TData,>({
    data,
    columns,
    sx = {},
    isLoading,
    enableSorting,
    defaultSorting,
    expandedRowIndex,
    hasNextPage,
    estimateSize = DEFAULT_ESTIMATE_SIZE,
    onBottomReached,
    onRowClick,
    renderEmptyBlock,
    renderExpandableBlock,
}: Props<TData>) => {
    const virtualizedRef = useRef<HTMLDivElement | null>(null);

    const { table, rows: allRows } = useReactTable({
        data,
        columns,
        enableSorting,
        defaultSorting,
    });

    const rowVirtualizer = useVirtualizer({
        count: allRows.length,
        estimateSize: () => estimateSize,
        getScrollElement: () => virtualizedRef?.current ?? null,
        overscan: 5,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const tableSize = rowVirtualizer.getTotalSize() + HEADER_SIZE;

    const rows = useMemo(
        () =>
            virtualRows.map((virtualRow, index) => {
                const row = allRows[virtualRow.index] as Row<TData>;
                const sxProps = {
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start - index * virtualRow.size}px)`,
                };

                return { ...row, sx: sxProps };
            }),
        [virtualRows, allRows],
    );

    const fetchMoreOnBottomReached = useCallback(
        (containerRefElement?: HTMLDivElement | null) => {
            if (containerRefElement) {
                const { scrollHeight, scrollTop, clientHeight } = containerRefElement;

                if (scrollHeight - scrollTop - clientHeight < clientHeight - 100 && !isLoading && hasNextPage) {
                    onBottomReached?.();
                }
            }
        },
        [onBottomReached, isLoading, hasNextPage],
    );

    useEffect(() => {
        fetchMoreOnBottomReached(virtualizedRef.current);
    }, [fetchMoreOnBottomReached]);

    return (
        <TableComponent
            isVirtualized
            table={table}
            rows={rows}
            sx={{
                ...sx,
                height: rows.length ? `${tableSize}px` : '100%',
                cursor: onRowClick ? 'pointer' : 'default',
                overflowY: 'initial',
            }}
            isLoading={isLoading}
            enableSorting={enableSorting}
            expandedRowIndex={expandedRowIndex}
            onRowClick={onRowClick}
            renderEmptyBlock={renderEmptyBlock}
            renderExpandableBlock={renderExpandableBlock}
            onScroll={(e) => fetchMoreOnBottomReached(e.target as HTMLDivElement)}
            ref={virtualizedRef}
        />
    );
};