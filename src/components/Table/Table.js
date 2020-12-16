import { Button, Empty, Tag, Tooltip } from "antd";
import Modal from "antd/lib/modal/Modal";
import { inject } from "mobx-react";
import { getRoot } from "mobx-state-tree";
import React from "react";
import { AiOutlineCheck, AiOutlineClose } from "react-icons/ai";
import { GiMonoWheelRobot } from "react-icons/gi";
import { VscQuestion } from "react-icons/vsc";
import { Spinner } from "../Common/Spinner";
import { Table } from "../Common/Table/Table";
import * as CellViews from "./CellViews";
import { GridView } from "./GridView";
import { TableStyles } from "./Table.styles";

const injector = inject(({ store }) => {
  const { dataStore, currentView } = store;
  const props = {
    dataStore,
    view: currentView,
    viewType: currentView?.type ?? "list",
    columns: currentView?.fieldsAsColumns ?? [],
    hiddenColumns: currentView?.hiddenColumnsList,
    selectedItems: currentView?.selected,
    selectedCount: currentView?.selected?.length ?? 0,
    isLabeling: store.isLabeling ?? false,
    data: dataStore?.list ?? [],
    total: dataStore?.total ?? 0,
    isLoading: dataStore?.loading ?? true,
    hasData: (store.project?.task_count ?? 0) > 0,
    focusedItem: dataStore?.selected ?? dataStore?.highlighted,
  };

  return props;
});

export const DataView = injector(
  ({
    data,
    columns,
    view,
    selectedItems,
    dataStore,
    viewType,
    total,
    isLoading,
    isLabeling,
    hiddenColumns = [],
    hasData = false,
    ...props
  }) => {
    const [showSource, setShowSource] = React.useState();

    const focusedItem = React.useMemo(() => {
      return props.focusedItem;
    }, [props.focusedItem]);

    const loadMore = React.useCallback(() => {
      if (!view.dataStore.hasNextPage && view.dataStore.loading) return;

      view.dataStore.fetch({ interaction: "scroll" });
    }, [view.dataStore]);

    const isItemLoaded = React.useCallback(
      (data, index) => {
        const rowExists = !!data[index];
        const hasNextPage = view.dataStore.hasNextPage;

        return !hasNextPage || rowExists;
      },
      [view.dataStore.hasNextPage]
    );

    const columnHeaderExtra = React.useCallback(
      ({ parent, help }) => (
        <>
          {parent && (
            <Tag color="blue" style={{ fontWeight: "bold" }}>
              {parent.title}
            </Tag>
          )}

          {help && (
            <Tooltip title={help}>
              <VscQuestion size={16} style={{ opacity: 0.5 }} />
            </Tooltip>
          )}
        </>
      ),
      []
    );

    const onSelectAll = React.useCallback(() => view.selectAll(), [view]);

    const onRowSelect = React.useCallback((id) => view.toggleSelected(id), [
      view,
    ]);

    const onRowClick = React.useCallback(
      (item) => {
        getRoot(view).startLabeling(item);
      },
      [view]
    );

    const renderContent = React.useCallback(
      (content) => {
        if (isLoading && total === 0 && !isLabeling) {
          return <Spinner size="large" />;
        } else if (total === 0 || !hasData) {
          return (
            <Empty
              description={
                hasData ? (
                  <span>Nothing's found.</span>
                ) : (
                  "Before you can start labeling, you need to import tasks."
                )
              }
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {!hasData && (
                <Button type="primary" href="./import">
                  Go to import
                </Button>
              )}
            </Empty>
          );
        }

        return content;
      },
      [hasData, isLabeling, isLoading, total]
    );

    const content =
      view.root.isLabeling || viewType === "list" ? (
        <Table
          view={view}
          data={data}
          rowHeight={70}
          total={total}
          loadMore={loadMore}
          fitContent={isLabeling}
          columns={columns}
          hiddenColumns={hiddenColumns}
          cellViews={CellViews}
          cellDecoration={{
            total_completions: {
              content(col) {
                return (
                  <Tooltip title={col.title}>
                    <AiOutlineCheck />
                  </Tooltip>
                );
              },
              style: { width: 85, minWidth: 85, maxWidth: 85 },
            },
            cancelled_completions: {
              content(col) {
                return (
                  <Tooltip title={col.title}>
                    <AiOutlineClose />
                  </Tooltip>
                );
              },
              style: { width: 85, minWidth: 85, maxWidth: 85 },
            },
            total_predictions: {
              content(col) {
                return (
                  <Tooltip title={col.title}>
                    <GiMonoWheelRobot />
                  </Tooltip>
                );
              },
              style: { width: 85, minWidth: 85, maxWidth: 85 },
            },
            completed_at: {
              style: { width: 180, minWidth: 180, maxWidth: 180 },
            },
          }}
          order={view.ordering}
          focusedItem={focusedItem}
          isItemLoaded={isItemLoaded}
          sortingEnabled={view.type === "list"}
          onSetOrder={(col) => view.setOrdering(col.id)}
          columnHeaderExtra={columnHeaderExtra}
          selectedItems={selectedItems}
          onSelectAll={onSelectAll}
          onSelectRow={onRowSelect}
          onRowClick={onRowClick}
          stopInteractions={view.dataStore.loading}
        />
      ) : (
        <GridView
          view={view}
          data={data}
          fields={columns}
          loadMore={loadMore}
          onChange={(id) => view.toggleSelected(id)}
          hiddenFields={hiddenColumns}
        />
      );

    // Render the UI for your table
    return (
      <TableStyles className="dm-content">
        {renderContent(content)}

        <Modal
          visible={!!showSource}
          onOk={() => setShowSource("")}
          onCancel={() => setShowSource("")}
        >
          <pre>
            {showSource
              ? JSON.stringify(JSON.parse(showSource), null, "  ")
              : ""}
          </pre>
        </Modal>
      </TableStyles>
    );
  }
);
