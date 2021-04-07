/** @global LSF */

/**
 * @typedef {{
 *  hiddenColumns?: {
 *    labeling?: string[],
 *    explore?: string[],
 *  },
 *  visibleColumns?: {
 *    labeling?: string[],
 *    explore?: string[],
 *  }
 * }} TableConfig
 */

/**
 * @typedef {{
 * root: HTMLElement,
 * polling: boolean,
 * apiGateway: string | URL,
 * apiEndpoints: import("../utils/api-proxy").Endpoints,
 * apiMockDisabled: boolean,
 * apiHeaders?: Dict<string>,
 * settings: Dict<any>,
 * labelStudio: Dict<any>,
 * env: "development" | "production",
 * mode: "labelstream" | "explorer",
 * table: TableConfig,
 * links: Dict<string|null>,
 * showPreviews: boolean,
 * projectId: number,
 * interfaces: Dict<boolean>,
 * instruments: Dict<any>,
 * toolbar?: string,
 * }} DMConfig
 */

import { inject, observer } from "mobx-react";
import { unmountComponentAtNode } from "react-dom";
import { instruments } from "../components/DataManager/Toolbar/instruments";
import { APIProxy } from "../utils/api-proxy";
import { objectToMap } from "../utils/helpers";
import { APIConfig } from "./api-config";
import { createApp } from "./app-create";
import { LSFWrapper } from "./lsf-sdk";

const DEFAULT_TOOLBAR = "actions columns filters ordering label-button loading-possum error-box | refresh view-toggle";

const prepareInstruments = (instruments) => {
  const result = Object.fromEntries(Object.entries(instruments).map(([name, builder]) => {
    return [name, builder({inject, observer})];
  }));

  return objectToMap(result);
};

export class DataManager {
  /** @type {HTMLElement} */
  root = null;

  /** @type {APIProxy} */
  api = null;

  /** @type {import("./lsf-sdk").LSFWrapper} */
  lsf = null;

  /** @type {Dict} */
  settings = {};

  /** @type {import("../stores/AppStore").AppStore} */
  store = null;

  /** @type {Dict<any>} */
  labelStudioOptions = {};

  /** @type {"development" | "production"} */
  env = "development";

  /** @type {"explorer" | "labelstream"} */
  mode = "explorer";

  /** @type {TableConfig} */
  tableConfig = {};

  /** @type {Dict<string|null>} */
  links = {
    import: "/import",
    export: "/export",
    settings: "./settings",
  };

  /**
   * @private
   * @type {Map<String, Set<Function>>}
   */
  callbacks = new Map();

  /**
   * @private
   * @type {Map<String, Set<Function>>}
   */
  actions = new Map();

  /** @type {Number} */
  apiVersion = 1;

  /** @type {boolean} */
  showPreviews = false;

  /** @type {boolean} */
  polling = true;

  /** @type {boolean} */
  started = false;

  instruments = new Map();

  /**
   * Constructor
   * @param {DMConfig} config
   */
  constructor(config) {
    this.root = config.root;
    this.projectId = config.projectId;
    this.settings = config.settings;
    this.labelStudioOptions = config.labelStudio;
    this.env = config.env ?? process.env.NODE_ENV ?? this.env;
    this.mode = config.mode ?? this.mode;
    this.tableConfig = config.table ?? {};
    this.apiVersion = config?.apiVersion ?? 1;
    this.links = Object.assign(this.links, config.links ?? {});
    this.showPreviews = config.showPreviews ?? false;
    this.polling = config.polling;
    this.toolbar = config.toolbar ?? DEFAULT_TOOLBAR;
    this.instruments = prepareInstruments(config.instruments),
    this.interfaces = objectToMap({
      tabs: true,
      toolbar: true,
      import: true,
      export: true,
      labelButton: true,
      backButton: true,
      labelingHeader: true,
      ...config.interfaces,
    });

    this.api = new APIProxy(
      this.apiConfig({
        apiGateway: config.apiGateway,
        apiEndpoints: config.apiEndpoints,
        apiMockDisabled: config.apiMockDisabled,
        apiSharedParams: config.apiSharedParams,
        apiHeaders: config.apiHeaders,
      })
    );

    this.initApp();
  }

  get isExplorer() {
    return this.mode === "labeling";
  }

  get isLabelStream() {
    return this.mode === "labelstream";
  }

  get projectId() {
    return (this._projectId = this._projectId ?? this.root.dataset?.projectId);
  }

  set projectId(value) {
    this._projectId = value;
  }

  apiConfig({
    apiGateway,
    apiEndpoints,
    apiMockDisabled,
    apiSharedParams,
    apiHeaders,
  }) {
    const config = Object.assign({}, APIConfig);

    config.gateway = apiGateway ?? config.gateway;
    config.mockDisabled = apiMockDisabled;
    config.commonHeaders = apiHeaders;

    Object.assign(config.endpoints, apiEndpoints ?? {});
    Object.assign(config, {
      sharedParams: {
        project: this.projectId,
        ...(apiSharedParams ?? {}),
      },
    });

    return config;
  }

  /**
   *
   * @param {impotr("../stores/Action.js").Action} action
   */
  addAction(action, callback) {
    const {id} = action;

    if (!id) throw new Error("Action must provide a unique ID");

    this.actions.set(id, {action, callback});
    this.store.addActions(action);
  }

  removeAction(id) {
    this.actions.delete(id);
    this.store.removeAction(id);
  }

  getAction(id) {
    return this.actions.get(id)?.callback;
  }

  installActions() {
    this.actions.forEach(({action, callback}) => {
      this.addAction(action, callback);
    });
  }

  registerInstrument(name, initializer) {
    if (instruments[name]) {
      return console.warn(`Can't override native instrument ${name}`);
    }

    this.instruments.set(name, initializer({
      store: this.store,
      observer: observer,
      inject: inject
    }));

    this.store.updateInstruments();
  }

  /**
   * Assign an event handler
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    const events = this.getEventCallbacks(eventName);
    events.add(callback);
    this.callbacks.set(eventName, events);
  }

  /**
   * Remove an event handler
   * If no callback provided, all assigned callbacks will be removed
   * @param {string} eventName
   * @param {Function?} callback
   */
  off(eventName, callback) {
    const events = this.getEventCallbacks(eventName);
    if (callback) {
      events.delete(callback);
    } else {
      events.clear();
    }
  }

  /**
   * Check if an event has at least one handler
   * @param {string} eventName Name of the event to check
   */
  hasHandler(eventName) {
    return this.getEventCallbacks(eventName).size > 0;
  }

  /**
   * Check if interface is enabled
   * @param {string} name Name of the interface
   */
  interfaceEnabled(name) {
    return this.store.interfaceEnabled(name);
  }

  /**
   *
   * @param {"explorer" | "labelstream"} mode
   */
  async setMode(mode) {
    const modeChanged = mode !== this.mode;
    this.mode = mode;
    this.store.setMode(mode);

    if (modeChanged) this.invoke('modeChanged', [this.mode]);
  }

  /**
   * Invoke handlers assigned to an event
   * @param {string} eventName
   * @param {any[]} args
   */
  async invoke(eventName, args) {
    this.getEventCallbacks(eventName).forEach((callback) =>
      callback.apply(this, args)
    );
  }

  /**
   * Get callbacks set for a particular event
   * @param {string} eventName
   */
  getEventCallbacks(eventName) {
    return this.callbacks.get(eventName) ?? new Set();
  }

  /** @private */
  async initApp() {
    this.store = await createApp(this.root, this);
    this.invoke('ready', [this]);
  }

  initLSF(element) {
    const task = this.store.taskStore.selected;
    const annotation = this.store.annotationStore.selected;
    const isLabelStream = this.mode === 'labelstream';

    if (!this.lsf) {
      console.log("Initialize LSF");

      this.lsf = new LSFWrapper(this, element, {
        ...this.labelStudioOptions,
        task,
        annotation,
        isLabelStream,
      });
    }
  }

  /**
   * Initialize LSF or use already initialized instance.
   * Render LSF interface and load task for labeling.
   * @param {HTMLElement} element Root element LSF will be rendered into
   * @param {import("../stores/Tasks").TaskModel} task
   */
  async startLabeling() {
    let [task, annotation] = [
      this.store.taskStore.selected,
      this.store.annotationStore.selected,
    ];

    const isLabelStream = this.mode === 'labelstream';

    // do nothing if the task is already selected
    if (this.lsf?.task && task && this.lsf.task.id === task.id) {
      return;
    }

    if (
      !isLabelStream &&
      this.lsf &&
      (this.lsf.task?.id !== task?.id || annotation !== undefined)
    ) {
      const annotationID = annotation?.id ?? task.lastAnnotation?.id;
      this.lsf.loadTask(task.id, annotationID);
    }
  }

  destroyLSF() {
    this.lsf?.destroy();
    this.lsf = undefined;
  }

  destroy(detachCallbacks = true) {
    if (this.store) this.store.destroy?.();
    unmountComponentAtNode(this.root);

    if (detachCallbacks) {
      this.callbacks.forEach((callbacks) => callbacks.clear());
      this.callbacks.clear();
    }
  }

  reload() {
    this.destroy(false);
    this.initApp();
    this.installActions();
  }

  async apiCall(...args) {
    return this.store.apiCall(...args);
  }
}
