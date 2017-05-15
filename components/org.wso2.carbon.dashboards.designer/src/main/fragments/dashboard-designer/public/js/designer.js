/**
 * Copyright (c) 2017, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function () {
    "use strict";
    var dashboard = dashboardMetadata.dashboard;
    var metadata = dashboardMetadata.metadata;
    var dashboardWidgetList = portal.dashboards.widgetList;
    var widgetInfo = {};
    var layoutInfo = {};
    var blockCount = 0;
    var content = "";

    /**
     * Initialize the dashboard viewer.
     * */
    var init = function () {
        renderBlocks(dashboard, renderBlockCallback);
        initGadgetList();
        initLayoutList();
        initPublishers(dashboard.widgets);
    };

    /**
     * Remove existing layout and widgets from the dashboard configuation.
     * */
    var destroyDashboard = function () {
        var html = '<div class="grid-stack" id="grid-stack"></div>';
        dashboard.blocks = [];
        dashboard.widgets = {};
        dashboard.widgetList = {};

        $('.grid-stack').data('gridstack').destroy(true);
        $('.gadgets-grid').html(html);
    }

    /**
     * Apply provided layout to the dashboard
     * */
    var applyLayout = function (layout) {
        dashboard.blocks = layout.blocks;
        blockCount = 0;
        saveDashboard();
        initGadgetList();
        renderBlocks(dashboard, renderDynamicBlockCallback);
    }

    /**
     * Render gadget blocks by reading the dashboard json.
     * @param dashboard {Object} dashboard json object
     * */
    var renderBlocks = function (dashboard, callback) {
        var i = "";
        for (i in dashboard.blocks) {
            var dashboardBlock = dashboard.blocks[i];
            UUFClient.renderFragment(Constants.WIDGET_CONTAINER_FRAGMENT_NAME, dashboardBlock,
                "gridContent", Constants.APPEND_MODE, callback);
        }
    };

    /**
     * Populate dashboardMetadata.publishers by reading the widget configs.
     * @param widgets
     * */
    var initPublishers = function (widgets) {
        var i;
        for (i in widgets) {
            if (widgets.hasOwnProperty(i)) {
                var widget = widgets[i];
                if (widget && widget.pubsub && widget.pubsub.isPublisher) {
                    dashboardMetadata.publishers.push(widget.pubsub.topic);
                }
            }
        }
    };

    /**
     * This is the callback which is triggered after generating the widgetList.
     * @type {{onSuccess: gadgetListCallback.onSuccess, onFailure: gadgetListCallback.onFailure}}
     */
    var widgetListCallback = {
        onSuccess: function () {
        },
        onFailure: function (message, e) {
        }
    };

    /**
     * This is the callback which is triggered after rendering blocks.
     * @type {{onSuccess: renderBlockCallback.onSuccess, onFailure: renderBlockCallback.onFailure}}
     */
    var renderBlockCallback = {
        onSuccess: function () {
            blockCount++;
            if (blockCount === dashboard.blocks.length) {
                initGridstack();
                renderWidgets(dashboard);
            }
        },
        onFailure: function () {
            blockCount++;
            if (blockCount === dashboard.blocks.length) {
                initGridstack();
                renderWidgets(dashboard);
            }
        }
    };

    /**
     * This is the callback which is triggered after dynamic rendering of blocks.
     * This will concatanate provided html content and append to the grid-stack before initializing.
     * @type {{onSuccess: renderDynamicBlockCallback.onSuccess, onFailure: renderDynamicBlockCallback.onFailure}}
     */
    var renderDynamicBlockCallback = {
        onSuccess: function (data) {
            content += data;
            blockCount++;
            if (blockCount === dashboard.blocks.length) {
                $('.grid-stack').append(content);
                initGridstack();
            }
        },
        onFailure: function () {
            blockCount++;
            if (blockCount === dashboard.blocks.length) {
                initGridstack();
            }
        }
    };

    /**
     * This method will initialize the widget component box's events and widget list's events.
     */
    var initGridstack = function () {
        $('.grid-stack').gridstack({
            width: 12,
            cellHeight: 50,
            verticalMargin: 30,
            disableResize: false,
            disableDrag: false
        }).on('dragstop', function () {
            updateLayout();
            saveDashboard();
        }).on('resizestart', function (e, ui) {
            // hide the component content on start resizing the component
            var container = $(ui.element).find('.dashboards-component');
            if (container) {
                container.find('.dashboards-component-body').hide();
            }
        }).on('resizestop', function (e, ui) {
            // re-render component on stop resizing the component
            var container = $(ui.element).find('.dashboards-component');
            if (container) {
                var gsItem = container.closest('.grid-stack-item');
                var node = gsItem.data('_gridstack_node');
                var blockId = gsItem.attr('data-id');
                var gsHeight = node ? node.height : parseInt(gsItem.attr('data-gs-height'));
                var height = (gsHeight * 150) + ((gsHeight - 1) * 30);
                container.closest('.dashboard-component-box').attr('data-height', height);
                container.find('.dashboards-component-body').show();
                if (dashboard.widgets[blockId]) {
                    renderWidgetByBlock(blockId);
                }
                container.find('.dashboards-component-body').show();
            }
            updateLayout();
            saveDashboard();
        });

        $('.gadgets-grid').on('click', '.dashboard-component-box .dashboards-trash-handle', function () {
            var that = $(this);
            var componentBox = that.closest('.dashboard-component-box');
            $('.grid-stack').data('gridstack').remove_widget(componentBox.parent());
            removeWidgetFromDashboardJSON(componentBox.attr("id"));
            updateLayout();
            saveDashboard();
            initGadgetList();
        });

        $('.gadgets-grid').on('click', '.dashboard-component-box .dashboards-config-handle', function (e) {
            e.preventDefault();
            var id = $(this).closest(".dashboard-component-box").attr('id');//$(this).attr('id');
            var i;
            var publishers = dashboardMetadata.publishers;
            if (publishers.length > 0) {
                $("#subscribe-label").show();
                $('#widget-conf-content').html('<select id="' + id + '" class="pubsub-topics">' + 
                    '<option disabled selected>Select Publisher:</option></select>');
                for (i in publishers) {
                    if (publishers.hasOwnProperty(i)) {
                        $('.pubsub-topics').append('<option class="dropdown-item" value="' + publishers[i] + '">' +
                            publishers[i] + '</option');
                    }
                }
            } else {
                $('#pusub-alert-no-publishers').show();
            }
            $.sidebar_toggle("show", "#right-sidebar", ".page-content-wrapper");
        });

        initializeWidgetConfigSidebar();
    };

    /**
     * Initialize the listeners for the widget configuration sidebar
     */
    var initializeWidgetConfigSidebar = function () {
        $('#right-sidebar').on('change', '.pubsub-topics', function (e) {
            var widgets = dashboardMetadata.dashboard.widgets;
            widgets[$(this).attr('id')].pubsub.subscribesTo.push($(this).val());
            saveDashboard();
            var widgetID = widgets[$(this).attr('id')].info.id;
            pubsub.subscribe( $(this).val(),portal.dashboards.subscribers[widgetID]._callback);
        });
    };

    /**
     * Initialized adding block function.
     * @return {null}
     */
    var initAddBlock = function () {

        var dummySizeChanged = function () {
            var dummy = $('.dashboards-dummy-gadget');
            var unitSize = parseInt(dummy.data('unit-size'));

            dummy.css({
                width: unitSize * parseInt($('#block-width').val()),
                height: unitSize * parseInt($('#block-height').val())
            });
        };

        // redraw the grid when changing the width/height values
        $('#block-height, #block-width')
            .on('change', dummySizeChanged)
            .on('keyup', dummySizeChanged)
            .on('blur', dummySizeChanged);

        // add block handler
        $('#add-block-btn').on('click', function () {

            var width = $('#block-width').val() || 0;
            var height = $('#block-height').val() || 0;
            var id = generateBlockGUID();

            if (width === 0 || height === 0) {
                return;
            }
            var data = {};
            data.height = height;
            data.id = id;
            data.width = width;
            data.x = 0;
            data.y = 0;
            UUFClient.renderFragment(Constants.WIDGET_CONTAINER_FRAGMENT_NAME, data, {
                onSuccess: function (data) {
                    $('.grid-stack').data('gridstack').add_widget(data, 0, 0, width, height);
                },
                onFailure: function (message, e) {
                    //TODO : Add notification to inform the user
                }
            });
            updateLayout();
            saveDashboard();
        });
        var dummyGadget = $('.dashboards-dummy-gadget');
        var blockWidth = $('#block-width');
        var blockHeight = $('#block-height');
        dummyGadget.resizable({
            grid: 18,
            containment: '.dashboards-block-container',
            resize: function () {
                var height = $(this).height() / 18;
                var width = $(this).width() / 18;
                blockWidth.val(width);
                blockHeight.val(height);
            }
        });
        blockWidth.val(dummyGadget.width() / 18);
        blockHeight.val(dummyGadget.height() / 18);
    };

    /**
     * Generate GUID.
     * @returns {String}
     */
    var generateBlockGUID = function () {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }

        return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
    };

    /**
     * update dashboard json Object by adding newly added widget.
     * @param blockID
     * @param widgetID
     */
    var addWidgetToDashboardJSON = function (blockID, widgetID) {
        dashboard.widgets[blockID] = widgetInfo[widgetID];
        dashboard.widgets[blockID].url = Constants.FRAGMENT_URL + widgetID;
    };

    /**
     * update dashboard json Object by removing newly deleted widget.
     * @param blockID
     */
    var removeWidgetFromDashboardJSON = function (blockID) {
        var block = dashboard.widgets[blockID];
        if (block && block.info && block.info.id) {
            updateWidgetList(block.info.id, null, "remove")
            delete dashboard.widgets[blockID];
        }
    };

    /**
     * retrieve the gadget list by invoking the available api.
     */
    var initGadgetList = function () {
        $('#widgetList').find('.dashboards-thumbnail').remove();
        var method = Constants.HTTP_GET;
        var url = Constants.WIDGET_METAINFO_GET_URL;
        $.ajax({
            url: url,
            method: method,
            async: true,
            success: function (widgetList) {
                generateWidgetInfoJSON(widgetList[0]);
                portal.dashboards.widgets = widgetInfo;
                var widgetJSONLength = widgetList[0].length;
                for (var i = 0; i < widgetJSONLength; i++) {
                    UUFClient.renderFragment(Constants.WIDGET_LIST_CONTAINER_FRAGMENT_NAME,
                        widgetList[0][i].info, "left-panel", Constants.APPEND_MODE, widgetListCallback);
                }
            }
        });
    };

    /**
     * retrieve the layout list by invoking the available api.
     */
    var initLayoutList = function () {
        var method = Constants.HTTP_GET;
        var url = Constants.LAYOUT_METAINFO_GET_URL;
        $.ajax({
            url: url,
            method: method,
            async: true,
            success: function (layoutList) {
                generateLayoutInfoJSON(layoutList[0]);
                var layoutJSONLength = layoutList[0].length;
                for (var i = 0; i < layoutJSONLength; i++) {
                    UUFClient.renderFragment(Constants.LAYOUT_LIST_CONTAINER_FRAGMENT_NAME, layoutList[0][i],
                        "layout-list", Constants.APPEND_MODE, widgetListCallback);
                }
            }
        });
    };

    /**
     * generate widgetInfo json object using retrieved data.
     * @param widgetList
     */
    var generateWidgetInfoJSON = function (widgetList) {
        var widgetListLength = widgetList.length;
        for (var i = 0; i < widgetListLength; i++) {
            widgetInfo[widgetList[i].info.id] = widgetList[i];
        }
    };

    /**
     * generate layoutInfo json object using retrieved data.
     * @param layoutList
     */
    var generateLayoutInfoJSON = function (layoutList) {
        var layoutListLength = layoutList.length;
        for (var i = 0; i < layoutListLength; i++) {
            portal.dashboards.layouts[layoutList[i].id] = layoutList[i];
            layoutInfo[layoutList[i].id] = layoutList[i];
        }
    };

    /**
     * Render Widgets in to blocks by reading the dashboard json.
     * */
    var renderWidgets = function (dashboard) {
        var i = "";
        for (i in dashboard.blocks) {
            if (dashboard.widgets[dashboard.blocks[i].id]) {
                dashboardWidgetList[dashboard.widgets[dashboard.blocks[i].id].info.id] =
                dashboard.widgets[dashboard.blocks[i].id];
                renderWidgetByBlock(dashboard.blocks[i].id);
            }
        }
    };

    /**
     * Wire Widgets by going through the available widget configs..
     * */
    var wireWidgets = function (widgets) {
        var i;
        for (i in widgets) {
            if (widgets[i].pubsub && widgets[i].pubsub.isSubscriber && widgets.hasOwnProperty(i)) {
                //considering widget is going to subscribe to only one publisher
                var widgetID = widgets[i].info.id;
                pubsub.subscribe(widgets[i].pubsub.subscribesTo[0],
                    portal.dashboards.subscribers[widgetID]._callback);
            }
        }
    };

    /**
     * Render Widget into a given block by reading the dashboard json.
     * */
    var renderWidgetByBlock = function (blockId) {
        //pub/sub is the only configurale parameter at the moment, update this when introducing new parameters.
        var isConfigurable = dashboard.widgets[blockId].pubsub && dashboard.widgets[blockId].pubsub.isSubscriber;
        widget.renderer.render(blockId, dashboard.widgets[blockId].url, isConfigurable, false);
    };

    /**
     * Render Widget into a given block by reading the dashboard json.
     * */
    var renderWidgetByURL = function (blockId, widgetURL, widgetId) {
        //pub/sub is the only configurale parameter at the moment, update this when introducing new parameters.
        var isConfigurable = portal.dashboards.widgets[widgetId].pubsub &&
        portal.dashboards.widgets[widgetId].pubsub.isSubscriber;
        widget.renderer.render(blockId, widgetURL, isConfigurable, false);
    };


    /**
     * Update the layout after modification.
     *
     */
    var updateLayout = function () {
        // extract the layout from the designer and save it
        var res = _.map($('.grid-stack .grid-stack-item:visible'), function (el) {
            el = $(el);
            var node = el.data('_gridstack_node');
            if (node) {
                return {
                    id: el.attr('data-id'),
                    x: node.x,
                    y: node.y,
                    width: node.width,
                    height: node.height
                };
            }
        });

        var serializedGrid = [];
        var resLength = res.length;
        for (var i = 0; i < resLength; i++) {
            if (res[i]) {
                serializedGrid.push(res[i]);
            }
        }
        dashboard.blocks = serializedGrid;
    };

    /**
     * Updates the widgetList global object based on the action.
     * @param id
     * @param widget
     * @param action
     *
     */
    var updateWidgetList = function (id, widget, action) {
        if (action === "add") {
            portal.dashboards.widgetList[id] = widget;
        } else {
            delete portal.dashboards.widgetList[id];
        }
    }

    /**
     * Saves the dashboard content.
     *
     */
    var saveDashboard = function () {
        var method = Constants.HTTP_PUT;
        var url = Constants.DASHBOARD_METADATA_UPDATE_URL;
        dashboard.url = dashboard.id;
        $.ajax({
            url: url,
            method: method,
            data: JSON.stringify(metaDataPayloadGeneration()),
            async: false,
            contentType: Constants.APPLICATION_JSON
        });
        //TODO: Implement notification message to display ajax call success/failure
    };

    /**
     * generate the metadata payload to invoke rest apis.
     * @returns metadata payload
     */
    var metaDataPayloadGeneration = function () {
        var metaDataPayload = {};
        if (!metadata) {
            metaDataPayload.url = dashboard.id;
            metaDataPayload.name = dashboard.name;
            metaDataPayload.version = dashboard.version;
            metaDataPayload.description = dashboard.description;
            metaDataPayload.isShared = dashboard.isShared;
            //TODO: Need to finalize with a parentID for original dashboards . Currently put -1 as parentID ,if it is not personalized
            metaDataPayload.parentId = "-1";
        } else {
            metaDataPayload = metadata;
            metaDataPayload.parentId = metadata.id;
        }
        //TODO: Need to update the hardcoded values with logged in user
        metaDataPayload.owner = "admin";
        metaDataPayload.lastUpdatedBy = "admin";
        metaDataPayload.lastUpdatedTime = new Date().getTime();
        metaDataPayload.content = JSON.stringify(dashboard);
        return metaDataPayload;
    };

    /**
     * globally exposed function to enable widget drag
     * Set the data.transfer widgetID
     */
    function widgetDrag(e) {
        e.dataTransfer.setData("widgetID", e.target.id);
    }

    /**
     * globally exposed function to enable widget drop
     * Save and update the dashboard using the new widget
     */
    function widgetDrop(e) {
        e.preventDefault();
        var widgetID = e.dataTransfer.getData("widgetID");
        var blockID = e.currentTarget.id;
        renderWidgetByURL(blockID, Constants.FRAGMENT_URL + widgetID, widgetID);
        addWidgetToDashboardJSON(blockID, widgetID);
        updateWidgetList(widgetID, portal.dashboards.widgets[widgetID], "add")
        updateLayout();
        saveDashboard();
        initGadgetList();
    }

    /**
     * globally exposed function to enable widget drop
     */
    function widgetAllowDrop(e) {
        e.preventDefault();
    }

    init();
    initAddBlock();
    //TODO make this a callback
    setTimeout(function(){ wireWidgets(portal.dashboards.widgetList); }, 5000);

    portal.dashboards.functions.designer = {
        renderBlocks: renderBlocks,
        destroyDashboard: destroyDashboard,
        applyLayout: applyLayout,
        widgetDrag:widgetDrag,
        widgetDrop:widgetDrop,
        widgetAllowDrop:widgetAllowDrop
    };

}());
