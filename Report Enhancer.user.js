// ==UserScript==
// @name         Report Enhancer
// @version      0.1
// @description  Refresh Reports
// @author       Matt Rafferty
// @include      https://liquidweb.lightning.force.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Don't run in the iframe
    if (window.self !== window.top){
        return;
    }

    var REPORT_REFRESH_INTERVAL = 60;

    var state = false
    var tabBar = false
    var iframe = false

    // Refresh Report Automatically //
    function refreshReport() {

        if(iframe) {
            iframe.contentDocument.querySelector("button.report-action-refreshReport").click()
        }
    }
    // Refresh Report Automatically //


    // Open Tickets As Workspace Tab //
    function clickTicket(event) {

        if(event.target.tagName == "A") {
            event.preventDefault();
            event.stopPropagation();
            $A.get("e.force:navigateToURL").setParams({
                'url': 'https://liquidweb.lightning.force.com' + event.target.getAttribute("href")
            }).fire();
        }
    }

    function addClickEvent(table) {

        table.querySelectorAll("tbody")[0].addEventListener('click',clickTicket,true);

        console.log("Ticket links modified.");
    }
    // Open Tickets As Workspace Tab //


    // Remove Duplicate Tickets //
    function reduceTickets(a, b) {
        if ("Case.CaseNumber" in b){
            if(!a[b["Case.CaseNumber"].label]){
                a[b["Case.CaseNumber"].label] = b
            }
        } else {
            a[b] = b;
        }
        return a;
    }

    function removeDuplicateTickets(table) {

        var tableKey = Object.keys(table)[1];
        var datasource = table[tableKey].children[1].props.dataSource;
        var data = Object.getPrototypeOf(datasource)._data;

        Object.getPrototypeOf(datasource)._data = Object.values(data.reduce(reduceTickets, {}))

        console.log("Duplicate tickets removed.");
    }
    // Remove Duplicate Tickets //


    async function modifyReport() {

        var full_table = iframe.contentDocument.querySelector("table.data-grid-table.data-grid-full-table")

        while(!full_table){
            await sleep(20);
            full_table = iframe.contentDocument.querySelector("table.data-grid-table.data-grid-full-table")
        }

        removeDuplicateTickets(full_table);
        addClickEvent(full_table);

        var fixed_table = iframe.contentDocument.querySelector("table.data-grid-table.data-grid-fixed-row-table")

        while(!fixed_table){
            await sleep(200);
            fixed_table = iframe.contentDocument.querySelector("table.data-grid-table.data-grid-fixed-row-table")
        }

        removeDuplicateTickets(fixed_table);
    }

    function datagridCallback(mutationList){
        var tableModified = mutationList.filter(
            event => event.addedNodes.length > 0
        )

        if(tableModified.length > 0) {
            modifyReport();
        }
    }

    async function tabRefreshCallback(mutationList,observer) {

        var iframeAdded = mutationList.filter(
            event => [...event.addedNodes].filter(
                node => node instanceof HTMLIFrameElement
            ).length > 0
        )

        if(iframeAdded.length > 0){
            initIframe();
        }
    }

    async function initIframe() {

        // Create observer to watch for new/removed tabs
        var oldiframe = iframe;
        iframe = document.querySelector("iframe.isView.reportsReportBuilder");

        while(!iframe || iframe === oldiframe) {
            await sleep(200);
            iframe = document.querySelector("iframe.isView.reportsReportBuilder");
        }

        await modifyReport();

        var datagrid = iframe.contentDocument.querySelector("div.data-grid")

        if(datagrid) {
            var observer = new MutationObserver(datagridCallback);
            observer.observe(datagrid,{childList:true})
        }

    }

    async function startReportEnhancer() {

        console.log("Starting report enhancer");

        await initIframe();

        // Set auto refresh function
        console.log("Setting refresh interval");
        setInterval(refreshReport, REPORT_REFRESH_INTERVAL*1000);

        var tabRefreshObserver = new MutationObserver(tabRefreshCallback);
        tabRefreshObserver.observe(iframe.parentElement,{childList:true})

    }

    function checkTabs() {

        // Check all tabs to see if any are the one we care about
        var openTabsArray = [...tabBar.querySelectorAll("li.oneConsoleTabItem")]

        var reportTab = false;

        openTabsArray.forEach(
            tab => {
                var a = tab.querySelector("a");
                if(a.hasAttribute("title") && a.getAttribute("title").startsWith("My Ticket Dashboard")){
                    reportTab = tab;
                }
            }
        )

        if(!state && reportTab ) {
            // Tab opened, startup
            state = true;
            startReportEnhancer();
        } else if (state && !reportTab) {
            // Tab closed, shutdown
            state = false;
            iframe = false;
            console.log("Stopping report enhancer");
        }
    }

    function watchTabs(newtabs, observer) {

        newtabs.forEach(
            tab => observer.observe(tab.querySelector("a"),{attributes: true, attributeFilter: ["title"]})
        )
    }

    function observerCallback(mutationList, observer){

        if(state) {
            var tabsRemoved = mutationList.filter(
                event => event.removedNodes.length > 0
            )

            // Check if we need to shutdown
            if(tabsRemoved.length > 0){
                checkTabs();
            }
        } else {

            // If tab gets its title  name changed, see if it's the one we want
            var titlesChanged = mutationList.filter(
                event => event.type == "attributes" && event.attributeName == "title"
            )

            if(titlesChanged.length > 0){
                checkTabs();
            }

            // Start watching new tabs as well
            var newtabs = mutationList.filter(
                event => [...event.addedNodes].filter(
                    node => node instanceof HTMLLIElement &&
                    node.classList.contains("oneConsoleTabItem")
                ).length > 0
            )

            if(newtabs.length > 0){
                newtabs = newtabs.map(record => [...record.addedNodes]);
                newtabs = [].concat.apply([],newtabs);
                watchTabs(newtabs, observer);
            }
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    async function init() {

        // Create observer to watch for new/removed tabs
        tabBar = document.querySelector("ul.tabBarItems.slds-grid");
        while(!tabBar) {
            await sleep(200);
            tabBar = document.querySelector("ul.tabBarItems.slds-grid");
        }

        var tabobserver = new MutationObserver(observerCallback);
        tabobserver.observe(tabBar,{childList: true});

        // Check tabs that are already open
        var initialtabs = [...tabBar.querySelectorAll("li.oneConsoleTabItem")];
        if(initialtabs.length > 0) {
            watchTabs(initialtabs, tabobserver);
        }
    }

    init();

})();