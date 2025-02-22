let graph, paper;
let currentTool = null;
let sourceElement = null;
let lastHighlightedView = null;
let selectedElements = [];

function clearHighlight() {
    if (Array.isArray(lastHighlightedView)) {
        lastHighlightedView.forEach((view) => {
            if (view && view.model && !view.model.isLink()) {
                const label = view.el.querySelector(".relationship-label");
                if (label) {
                    label.remove();
                }
                view.unhighlight();
            }
        });
    } else if (
        lastHighlightedView &&
        lastHighlightedView.model &&
        !lastHighlightedView.model.isLink()
    ) {
        const label = lastHighlightedView.el.querySelector(
            ".relationship-label"
        );
        if (label) {
            label.remove();
        }
        lastHighlightedView.unhighlight();
    }
    lastHighlightedView = null;
}

document.addEventListener("DOMContentLoaded", function () {
    graph = new joint.dia.Graph();

    paper = new joint.dia.Paper({
        el: document.getElementById("paper"),
        model: graph,
        width: "100%",
        height: "100%",
        gridSize: 10,
        drawGrid: {
            name: "dot",
            args: {
                color: "#e5e7eb",
                thickness: 1,
                scaleFactor: 2,
                grid: {
                    xs: 10,
                    x: 20,
                },
            },
        },
        background: {
            color: "#ffffff",
        },
        defaultLink: new joint.dia.Link({
            attrs: {
                ".connection": {
                    stroke: "#6366f1",
                    "stroke-width": 1.5,
                    "pointer-events": "stroke",
                },
            },
        }),
        defaultConnector: { name: "rounded" },
        defaultRouter: { name: "manhattan" },
        interactive: {
            linkMove: false,
            elementMove: true,
            addLinkFromMagnet: false,
            stopDelegation: false,
        },
        snapLinks: true,
        markAvailable: true,
        validateConnection: function (
            cellViewS,
            magnetS,
            cellViewT,
            magnetT,
            end,
            linkView
        ) {
            return cellViewS !== cellViewT;
        },
    });

    paper.$el.css({
        border: "none",
        borderLeft: "1px solid #e2e8f0",
        boxShadow:
            "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    });

    let isPanning = false;
    let startX, startY;
    let originalTranslate;

    paper.on("blank:pointerdown", function (evt, x, y) {
        if (!currentTool) {
            isPanning = true;
            startX = evt.clientX;
            startY = evt.clientY;
            originalTranslate = paper.translate();
            paper.el.style.cursor = "grabbing";
        }
    });

    document.addEventListener("mousemove", function (evt) {
        if (isPanning) {
            const dx = evt.clientX - startX;
            const dy = evt.clientY - startY;
            paper.translate(
                originalTranslate.tx + dx,
                originalTranslate.ty + dy
            );
        }
    });

    document.addEventListener("mouseup", function (evt) {
        if (isPanning) {
            isPanning = false;
            paper.el.style.cursor = "default";
        }
    });

    paper.el.addEventListener(
        "wheel",
        function (e) {
            if (e.ctrlKey) {
                e.preventDefault();
                const delta = e.deltaY;
                const currentScale = paper.scale().sx;
                let newScale;

                if (delta < 0) {
                    newScale = Math.min(3, currentScale * 1.1); // Zoom in
                } else {
                    newScale = Math.max(0.2, currentScale * 0.9); // Zoom out
                }

                const offsetX = e.offsetX;
                const offsetY = e.offsetY;

                const currentTranslate = paper.translate();

                const zoomPoint = {
                    x: offsetX - currentTranslate.tx,
                    y: offsetY - currentTranslate.ty,
                };

                const newTranslate = {
                    tx: offsetX - (zoomPoint.x * newScale) / currentScale,
                    ty: offsetY - (zoomPoint.y * newScale) / currentScale,
                };

                paper.scale(newScale, newScale);
                paper.translate(newTranslate.tx, newTranslate.ty);
            }
        },
        { passive: false }
    );

    initializeTools();

    document.addEventListener("keydown", function (e) {
        if (e.key === "Delete" && selectedElements.length > 0) {
            selectedElements.forEach((cellView) => {
                cellView.model.remove();
            });
            selectedElements = [];
            showMessage("Elements deleted", "info");
            return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "a") {
            e.preventDefault();
            selectedElements.forEach((cellView) => {
                cellView.unhighlight();
            });
            selectedElements = [];

            const elements = graph.getCells();
            elements.forEach((cell) => {
                const cellView = paper.findViewByModel(cell);
                if (cellView) {
                    cellView.highlight();
                    selectedElements.push(cellView);
                }
            });
            showMessage("All elements selected", "info");
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "s") {
            e.preventDefault();
            saveScreenshot();
        }

        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault();
            if (history.canUndo()) {
                history.undo();
                showMessage("Undo successful", "info");
            } else {
                showMessage("Nothing to undo", "info");
            }
        }
    });

    paper.on("cell:pointerdown", function (cellView, evt, x, y) {
        paper.model.lastClickedPosition = { x, y };
    });

    const zoomMessage = document.createElement("div");
    zoomMessage.className =
        "fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded-md text-sm opacity-75";
    zoomMessage.innerHTML = "Use Ctrl + Mouse Wheel to zoom";
    document.body.appendChild(zoomMessage);
    setTimeout(() => {
        zoomMessage.style.opacity = "0";
        zoomMessage.style.transition = "opacity 0.5s ease-in-out";
        setTimeout(() => zoomMessage.remove(), 500);
    }, 3000);

    paper.on("cell:pointerclick", function (cellView, evt) {
        if (currentTool && currentTool.startsWith("add")) {
            if (!(cellView.model instanceof joint.shapes.uml.Class)) {
                return;
            }

            if (!sourceElement) {
                clearHighlight();
                sourceElement = cellView.model;

                const label = document.createElement("div");
                label.className = "relationship-label";
                label.textContent = "Select target";
                cellView.el.appendChild(label);

                cellView.highlight(null, {
                    highlighter: {
                        name: "stroke",
                        options: {
                            attrs: {
                                stroke: "#059669",
                                "stroke-width": 3,
                                "stroke-dasharray": "5,5",
                            },
                        },
                    },
                });

                lastHighlightedView = cellView;
                showMessage(
                    `Select target for ${currentTool.replace("add", "")}`,
                    "info"
                );
            } else {
                clearHighlight();

                const targetElement = cellView.model;
                if (sourceElement === targetElement) {
                    sourceElement = null;
                    currentTool = null;
                    updateToolbarState();
                    showMessage(
                        "Cannot create relationship with the same element",
                        "error"
                    );
                    return;
                }

                createRelationship(currentTool, sourceElement, targetElement);
                sourceElement = null;
                currentTool = null;
                updateToolbarState();
                showMessage("Relationship created", "success");
            }
        } else {
            if (!evt.ctrlKey && !evt.metaKey) {
                selectedElements.forEach((view) => {
                    view.unhighlight();
                });
                selectedElements = [];
            }

            selectedElements.push(cellView);
            cellView.highlight();
        }
    });

    paper.on("blank:pointerclick", function (evt, x, y) {
        clearHighlight();
        sourceElement = null;
        currentTool = null;
        updateToolbarState();

        selectedElements.forEach((cellView) => {
            cellView.unhighlight();
        });
        selectedElements = [];

        if (currentTool === "addClass") {
            const classShape = UMLShapes.createClass({ x, y });
            graph.addCell(classShape);
        } else if (currentTool === "addInterface") {
            const interfaceShape = UMLShapes.createInterface({ x, y });
            graph.addCell(interfaceShape);
        } else if (currentTool === "addAbstractClass") {
            const abstractClassShape = UMLShapes.createAbstractClass({ x, y });
            graph.addCell(abstractClassShape);
        }
    });

    paper.on("cell:pointerdblclick", function (cellView, evt, x, y) {
        if (cellView.model instanceof joint.shapes.uml.Class) {
            editClass(cellView.model);
        } else if (cellView.model instanceof joint.dia.Link) {
            editRelationship(cellView.model);
        }
    });

    document
        .getElementById("codeGenButton")
        .addEventListener("click", showLanguageSelection);

    function showLanguageSelection() {
        const modal = document.createElement("div");
        modal.className = "fixed inset-0 flex items-center justify-center z-50";
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl w-72 overflow-hidden">
                <div class="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3">
                    <h3 class="text-base font-semibold text-white flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                        </svg>
                        Select Language
                    </h3>
                </div>
                <div class="p-4 space-y-2">
                    <button class="language-btn java w-full px-3 py-2 rounded-md text-left font-medium transition-all duration-200
                                 border border-gray-200 hover:shadow-md focus:outline-none text-sm"
                            data-language="java">
                        <div class="flex items-center">
                            <span class="text-base mr-2">☕</span>
                            <span>Java</span>
                        </div>
                    </button>
                    <button class="language-btn python w-full px-3 py-2 rounded-md text-left font-medium transition-all duration-200
                                 border border-gray-200 hover:shadow-md focus:outline-none text-sm"
                            data-language="python">
                        <div class="flex items-center">
                            <span class="text-base mr-2">🐍</span>
                            <span>Python</span>
                        </div>
                    </button>
                    <button class="language-btn php w-full px-3 py-2 rounded-md text-left font-medium transition-all duration-200
                                 border border-gray-200 hover:shadow-md focus:outline-none text-sm"
                            data-language="php">
                        <div class="flex items-center">
                            <span class="text-base mr-2">🐘</span>
                            <span>PHP</span>
                        </div>
                    </button>
                </div>
                <div class="bg-gray-50 px-4 py-3 flex justify-end border-t">
                    <button id="cancelLanguageSelect"
                        class="px-3 py-1.5 rounded-md text-sm font-medium text-gray-700
                               hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2
                               focus:ring-gray-500 transition-colors duration-150 ease-in-out">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        const overlay = document.createElement("div");
        overlay.className = "fixed inset-0 bg-black bg-opacity-50";

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        const languageButtons = modal.querySelectorAll(".language-btn");
        languageButtons.forEach((button) => {
            button.addEventListener("click", function () {
                const language = this.dataset.language;
                showCodePreview(language);
            });
        });

        const cancelButton = document.getElementById("cancelLanguageSelect");
        cancelButton.addEventListener("click", closeModal);
        overlay.addEventListener("click", closeModal);

        const handleEsc = (e) => {
            if (e.key === "Escape") {
                closeModal();
            }
        };
        document.addEventListener("keydown", handleEsc);

        function closeModal() {
            document.body.removeChild(modal);
            document.body.removeChild(overlay);
            document.removeEventListener("keydown", handleEsc);
        }
    }

    function showCodePreview(language) {
        const code = CodeGenerator.generateCode(graph, language);

        const modal = document.createElement("div");
        modal.className = "fixed inset-0 flex items-center justify-center z-50";
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full h-3/4 overflow-hidden flex flex-col">
                <div class="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4 flex justify-between items-center">
                    <h3 class="text-xl font-semibold text-white flex items-center">
                        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                        </svg>
                        Generated ${language.toUpperCase()} Code
                    </h3>
                    <button id="copyCode" class="text-white hover:text-gray-200 focus:outline-none">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                        </svg>
                    </button>
                </div>
                <div class="flex-1 p-6 overflow-auto">
                    <pre class="font-mono text-sm bg-gray-50 p-4 rounded-md overflow-x-auto"><code>${escapeHtml(
                        code
                    )}</code></pre>
                </div>
                <div class="bg-gray-50 px-6 py-4 flex justify-between space-x-3 border-t">
                    <button id="backToLanguages"
                        class="px-4 py-2 rounded-md text-sm font-medium text-gray-700
                               hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2
                               focus:ring-gray-500 transition-colors duration-150 ease-in-out flex items-center">
                        <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                        </svg>
                        Back
                    </button>
                    <div class="flex space-x-3">
                        <button id="downloadCode"
                            class="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600
                                   hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2
                                   focus:ring-indigo-500 transition-colors duration-150 ease-in-out">
                            Download Code
                        </button>
                        <button id="closeModal"
                            class="px-4 py-2 rounded-md text-sm font-medium text-gray-700
                                   hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2
                                   focus:ring-gray-500 transition-colors duration-150 ease-in-out">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;

        const overlay = document.createElement("div");
        overlay.className = "fixed inset-0 bg-black bg-opacity-50";

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        document
            .getElementById("copyCode")
            .addEventListener("click", function () {
                navigator.clipboard
                    .writeText(code)
                    .then(() => {
                        showMessage("Code copied to clipboard", "success");
                    })
                    .catch(() => {
                        showMessage("Failed to copy code", "error");
                    });
            });

        document
            .getElementById("downloadCode")
            .addEventListener("click", function () {
                const fileExtension = {
                    java: ".java",
                    python: ".py",
                    php: ".php",
                }[language];

                const blob = new Blob([code], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `generated_code${fileExtension}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showMessage("Code downloaded", "success");
            });

        document
            .getElementById("backToLanguages")
            .addEventListener("click", function () {
                closeModal();
                showLanguageSelection();
            });

        const closeButton = document.getElementById("closeModal");
        closeButton.addEventListener("click", closeModal);
        overlay.addEventListener("click", closeModal);

        const handleEsc = (e) => {
            if (e.key === "Escape") {
                closeModal();
            }
        };
        document.addEventListener("keydown", handleEsc);

        function closeModal() {
            document.body.removeChild(modal);
            document.body.removeChild(overlay);
            document.removeEventListener("keydown", handleEsc);
        }
    }
});

function initializeTools() {
    const buttons = document.querySelectorAll(".tool-btn");
    buttons.forEach((button) => {
        button.setAttribute("draggable", "true");

        button.addEventListener("dragstart", function (e) {
            setCurrentTool(this.id);
            e.dataTransfer.setData("text/plain", this.id);
            this.classList.add("opacity-50");
        });

        button.addEventListener("dragend", function () {
            this.classList.remove("opacity-50");
        });
    });

    const paperEl = document.getElementById("paper");
    paperEl.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    });

    paperEl.addEventListener("drop", function (e) {
        e.preventDefault();
        const tool = e.dataTransfer.getData("text/plain");
        const paperOffset = this.getBoundingClientRect();
        const scale = paper.scale().sx;

        const x = (e.clientX - paperOffset.left) / scale;
        const y = (e.clientY - paperOffset.top) / scale;

        if (tool === "addClass") {
            const classShape = UMLShapes.createClass({ x, y });
            graph.addCell(classShape);
        } else if (tool === "addInterface") {
            const interfaceShape = UMLShapes.createInterface({ x, y });
            graph.addCell(interfaceShape);
        } else if (tool === "addAbstractClass") {
            const abstractClassShape = UMLShapes.createAbstractClass({ x, y });
            graph.addCell(abstractClassShape);
        }

        currentTool = null;
        updateToolbarState();
    });

    document
        .getElementById("addClass")
        .addEventListener("click", () => setCurrentTool("addClass"));
    document
        .getElementById("addInterface")
        .addEventListener("click", () => setCurrentTool("addInterface"));
    document
        .getElementById("addAbstractClass")
        .addEventListener("click", () => setCurrentTool("addAbstractClass"));

    document
        .getElementById("addAssociation")
        .addEventListener("click", () => setCurrentTool("addAssociation"));
    document
        .getElementById("addNavigableAssociation")
        .addEventListener("click", () =>
            setCurrentTool("addNavigableAssociation")
        );
    document
        .getElementById("addInheritance")
        .addEventListener("click", () => setCurrentTool("addInheritance"));
    document
        .getElementById("addImplementation")
        .addEventListener("click", () => setCurrentTool("addImplementation"));
    document
        .getElementById("addComposition")
        .addEventListener("click", () => setCurrentTool("addComposition"));
    document
        .getElementById("addAggregation")
        .addEventListener("click", () => setCurrentTool("addAggregation"));
}

function setCurrentTool(tool) {
    currentTool = tool;
    sourceElement = null;
    updateToolbarState();
}

function updateToolbarState() {
    const buttons = document.querySelectorAll(".tool-btn");
    buttons.forEach((button) => {
        // Remove active class from all buttons first
        button.classList.remove("active");
        // Add active class to the current tool
        if (button.id === currentTool) {
            button.classList.add("active");
        }
    });
}

function createRelationship(tool, source, target) {
    let relationship;

    switch (tool) {
        case "addAssociation":
            relationship = Relationships.createAssociation(source, target);
            break;
        case "addNavigableAssociation":
            relationship = Relationships.createNavigableAssociation(
                source,
                target
            );
            break;
        case "addInheritance":
            relationship = Relationships.createInheritance(source, target);
            break;
        case "addImplementation":
            relationship = Relationships.createImplementation(source, target);
            break;
        case "addComposition":
            relationship = Relationships.createComposition(source, target);
            break;
        case "addAggregation":
            relationship = Relationships.createAggregation(source, target);
            break;
    }

    if (relationship) {
        graph.addCell(relationship);
    }
}

function editClass(classModel) {
    const isInterface = classModel.get("name").includes("<<interface>>");
    const currentName = classModel
        .get("name")
        .replace(/<<interface>>\n|<<abstract>>\n/, "");
    const currentAttrs = classModel.get("attributes") || [];
    const currentMethods = classModel.get("methods");

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 flex items-center justify-center z-50";
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
                <h3 class="text-xl font-semibold text-white flex items-center">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    ${isInterface ? "Edit Interface" : "Edit Class"}
                </h3>
            </div>
            <div class="p-6 space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">${
                        isInterface ? "Interface Name" : "Class Name"
                    }</label>
                    <input type="text" id="className" value="${currentName}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2
                               focus:ring-indigo-500 focus:border-indigo-500 font-mono">
                </div>
                ${
                    !isInterface
                        ? `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Attributes</label>
                    <textarea id="attributes"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2
                               focus:ring-indigo-500 focus:border-indigo-500 font-mono h-32 resize-none"
                    >${currentAttrs.join("\n")}</textarea>
                    <p class="mt-2 text-sm text-gray-500 flex items-center">
                        <svg class="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        One attribute per line (e.g., +name: String)
                    </p>
                </div>
                `
                        : ""
                }
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Methods</label>
                    <textarea id="methods"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2
                               focus:ring-indigo-500 focus:border-indigo-500 font-mono h-32 resize-none"
                    >${currentMethods.join("\n")}</textarea>
                    <p class="mt-2 text-sm text-gray-500 flex items-center">
                        <svg class="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        ${
                            isInterface
                                ? "All methods must be public (+)"
                                : "One method per line (e.g., +methodName(): ReturnType)"
                        }
                    </p>
                </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
                <button id="cancelEdit"
                    class="px-4 py-2 rounded-md text-sm font-medium text-gray-700
                           hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2
                           focus:ring-gray-500 transition-colors duration-150 ease-in-out">Cancel</button>
                <button id="saveEdit"
                    class="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600
                           hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2
                           focus:ring-indigo-500 transition-colors duration-150 ease-in-out">Save</button>
            </div>
        </div>
    `;

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-black bg-opacity-50";

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    document.getElementById("saveEdit").addEventListener("click", function () {
        const newName = document.getElementById("className").value;
        const newAttrs = !isInterface
            ? document
                  .getElementById("attributes")
                  .value.split("\n")
                  .filter((line) => line.trim())
            : [];
        const newMethods = document
            .getElementById("methods")
            .value.split("\n")
            .filter((line) => line.trim());

        const processedMethods = isInterface
            ? newMethods.map((method) =>
                  method.startsWith("+") ? method : "+" + method
              )
            : newMethods;

        const calculateWidth = (texts) => {
            const textLengths = texts.map((text) => text.length * 8);
            return Math.max(...textLengths, 150);
        };

        const calculateHeight = (attrs, methods) => {
            const totalItems = isInterface
                ? methods.length
                : attrs.length + methods.length;
            const headerHeight = 40;
            const itemHeight = 20;
            return headerHeight + totalItems * itemHeight;
        };

        const newWidth = calculateWidth([newName, ...newAttrs, ...newMethods]);
        const newHeight = calculateHeight(newAttrs, newMethods);

        classModel.set(
            "name",
            isInterface ? `<<interface>>\n${newName}` : newName
        );
        classModel.set("attributes", newAttrs);
        classModel.set("methods", processedMethods);
        classModel.resize(newWidth, newHeight);

        closeModal();
    });

    document.getElementById("cancelEdit").addEventListener("click", closeModal);

    function closeModal() {
        document.body.removeChild(modal);
        document.body.removeChild(overlay);
    }
}

function editRelationship(relationshipModel) {
    const labels = relationshipModel.labels() || [];
    const sourceMultiplicity = labels[0]?.attrs?.text?.text || "1";
    const targetMultiplicity = labels[1]?.attrs?.text?.text || "1";

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 flex items-center justify-center z-50";

    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
                <h3 class="text-xl font-semibold text-white flex items-center">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                    </svg>
                    Edit Relationship Multiplicities
                </h3>
            </div>
            <div class="p-6 space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Source Multiplicity</label>
                    <input type="text" id="sourceMultiplicity" value="${sourceMultiplicity}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2
                               focus:ring-indigo-500 focus:border-indigo-500 font-mono">
                    <p class="mt-2 text-sm text-gray-500 flex items-center">
                        <svg class="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Examples: 1, 0..1, *, 1..*, 0..*
                    </p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Target Multiplicity</label>
                    <input type="text" id="targetMultiplicity" value="${targetMultiplicity}"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2
                               focus:ring-indigo-500 focus:border-indigo-500 font-mono">
                    <p class="mt-2 text-sm text-gray-500 flex items-center">
                        <svg class="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Examples: 1, 0..1, *, 1..*, 0..*
                    </p>
                </div>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
                <button id="cancelEdit"
                    class="px-4 py-2 rounded-md text-sm font-medium text-gray-700
                           hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2
                           focus:ring-gray-500 transition-colors duration-150 ease-in-out">Cancel</button>
                <button id="saveEdit"
                    class="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600
                           hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2
                           focus:ring-indigo-500 transition-colors duration-150 ease-in-out">Save</button>
            </div>
        </div>
    `;

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 bg-black bg-opacity-50";

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    document.getElementById("saveEdit").addEventListener("click", function () {
        const sourceMulti = document
            .getElementById("sourceMultiplicity")
            .value.trim();
        const targetMulti = document
            .getElementById("targetMultiplicity")
            .value.trim();

        relationshipModel.labels([
            {
                position: 0.1,
                attrs: {
                    text: {
                        text: sourceMulti,
                        fill: "#4b5563",
                        "font-family": "JetBrains Mono",
                        "font-size": 11,
                    },
                },
            },
            {
                position: 0.9,
                attrs: {
                    text: {
                        text: targetMulti,
                        fill: "#4b5563",
                        "font-family": "JetBrains Mono",
                        "font-size": 11,
                    },
                },
            },
        ]);

        closeModal();
    });

    document.getElementById("cancelEdit").addEventListener("click", closeModal);

    function closeModal() {
        document.body.removeChild(modal);
        document.body.removeChild(overlay);
    }
}

function showMessage(message, type = "info") {
    const existingMessage = document.querySelector(".message-popup");
    if (existingMessage) {
        existingMessage.remove();
    }

    const messageEl = document.createElement("div");
    const bgColor = {
        info: "bg-blue-500",
        error: "bg-red-500",
        success: "bg-green-500",
    }[type];

    messageEl.className = `message-popup fixed bottom-4 right-4 ${bgColor} text-white px-4 py-2 rounded-md
                          shadow-lg text-sm font-medium opacity-90 transition-opacity duration-300`;
    messageEl.textContent = message;
    document.body.appendChild(messageEl);

    setTimeout(() => {
        messageEl.style.opacity = "0";
        setTimeout(() => messageEl.remove(), 300);
    }, 2000);
}

function selectAllElements() {
    clearHighlight();

    const elements = graph.getElements();

    elements.forEach((element) => {
        const elementView = element.findView(paper);
        if (elementView) {
            elementView.highlight(null, {
                highlighter: {
                    name: "stroke",
                    options: {
                        attrs: {
                            stroke: "#3b82f6",
                            "stroke-width": 3,
                            rx: 5,
                            ry: 5,
                            "stroke-dasharray": "0",
                        },
                    },
                },
            });
        }
    });

    lastHighlightedView = elements.map((element) => element.findView(paper));

    showMessage(`Selected ${elements.length} elements`, "info");
}

function saveScreenshot() {
    const paperElement = paper.el;

    const canvas = document.createElement("canvas");
    const rect = paperElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const svgElement = paperElement.querySelector("svg");
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function () {
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(function (blob) {
            const downloadLink = document.createElement("a");
            downloadLink.download = "uml-diagram.png";
            downloadLink.href = URL.createObjectURL(blob);

            downloadLink.click();

            URL.revokeObjectURL(downloadLink.href);
            URL.revokeObjectURL(url);

            showMessage("Screenshot saved", "success");
        }, "image/png");
    };
    img.src = url;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
