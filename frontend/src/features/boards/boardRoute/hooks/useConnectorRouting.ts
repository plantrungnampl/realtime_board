import { useCallback } from "react";

import type { BoardElement } from "@/types/board";
import { ROUTE_OBSTACLES } from "@/features/boards/boardRoute/constants";
import { getElementBounds } from "@/features/boards/elementMove.utils";
import { routeOrthogonalPath } from "@/features/boards/routing/orthogonalRouter";

const ROUTE_PADDING = 12;
const ROUTE_MARGIN = 320;
const ROUTE_BEND_PENALTY = 20;

type RouteRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const useConnectorRouting = () => {
  const toRouteRect = useCallback(
    (bounds: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }): RouteRect => ({
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
    }),
    [],
  );

  const buildConnectorRoute = useCallback(
    (connector: BoardElement, obstacleElements: BoardElement[]) => {
      if (connector.element_type !== "Connector") return connector;
      const obstacles = obstacleElements
        .filter(
          (element) =>
            element.id !== connector.id && ROUTE_OBSTACLES.has(element.element_type),
        )
        .map((element) => toRouteRect(getElementBounds(element)));
      const routed = routeOrthogonalPath(
        connector.properties.start,
        connector.properties.end,
        obstacles,
        {
          padding: ROUTE_PADDING,
          margin: ROUTE_MARGIN,
          bendPenalty: ROUTE_BEND_PENALTY,
        },
      );
      return {
        ...connector,
        position_x: routed.bounds.left,
        position_y: routed.bounds.top,
        width: Math.max(1, routed.bounds.right - routed.bounds.left),
        height: Math.max(1, routed.bounds.bottom - routed.bounds.top),
        properties: {
          ...connector.properties,
          points: routed.points,
        },
      };
    },
    [toRouteRect],
  );

  return { buildConnectorRoute };
};
