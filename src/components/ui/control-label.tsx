"use client";

import { createContext } from "react";

/** 设置行内的控件共享可读名称；控件自身的 aria 标签优先。 */
export const ControlLabelContext = createContext<string | undefined>(undefined);
