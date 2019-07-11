/* eslint max-statements: ["error", 100] */
(function () {
    'use strict';

    angular.module('iguazio.dashboard-controls')
        .component('nclFunctionFromTemplate', {
            bindings: {
                project: '<',
                projects: '<',
                toggleSplashScreen: '&',
                getFunctionTemplates: '&',
                createNewProject: '<',
                renderTemplate: '&',
                selectedProject: '<'
            },
            templateUrl: 'nuclio/common/screens/create-function/function-from-template/function-from-template.tpl.html',
            controller: FunctionFromTemplateController
        });

    function FunctionFromTemplateController($element, $window, $scope, $state, $timeout, $i18next, i18next, lodash, ngDialog,
                                            DialogsService, ValidatingPatternsService) {
        var ctrl = this;
        var lng = i18next.language;
        var templatesOriginalObject = {}; // will always save original templates

        ctrl.functionName = '';
        ctrl.templatesWorkingCopy = {};
        ctrl.inputModelOptions = {
            debounce: {
                'default': 0
            }
        };
        ctrl.functionData = {};
        ctrl.isCreateFunctionAllowed = false;
        ctrl.page = {};
        ctrl.runtimeFilters = [];
        ctrl.selectedTemplate = '';
        ctrl.selectedRuntimeFilter = {
            id: 'all',
            name: $i18next.t('common:ALL', {lng: lng}),
            visible: true
        };
        ctrl.searchQuery = '';

        ctrl.$onInit = onInit;
        ctrl.$onChanges = onChanges;
        ctrl.$onDestroy = onDestroy;

        ctrl.validationPatterns = ValidatingPatternsService;

        ctrl.cancelCreating = cancelCreating;
        ctrl.createFunction = createFunction;
        ctrl.inputValueCallback = inputValueCallback;
        ctrl.isTemplateSelected = isTemplateSelected;
        ctrl.isProjectsDropDownVisible = isProjectsDropDownVisible;
        ctrl.onChangeSearchQuery = onChangeSearchQuery;
        ctrl.onRuntimeFilterChange = onRuntimeFilterChange;
        ctrl.onProjectChange = onProjectChange;
        ctrl.paginationCallback = paginationCallback;
        ctrl.selectTemplate = selectTemplate;
        ctrl.unselectTemplate = unselectTemplate;

        //
        // Hook methods
        //

        /**
         * Initialization method
         */
        function onInit() {
            ctrl.toggleSplashScreen({ value: true });

            initFunctionData();

            angular.element($window).on('resize', paginateTemplates);
        }

        /**
         * Bindings changes hook
         * @param {Object} changes - changed bindings
         */
        function onChanges(changes) {
            if (angular.isDefined(changes.projects)) {
                prepareProjects();
            }
        }

        /**
         * Destructor
         */
        function onDestroy() {
            angular.element($window).off('resize', paginateTemplates);
        }

        //
        // Public methods
        //

        /**
         * Cancels creating a function
         */
        function cancelCreating(event) {
            event.preventDefault();

            if (!lodash.isEmpty(ctrl.project)) {
                $state.go('app.project.functions', {
                    projectId: ctrl.project.metadata.name,
                    createCancelled: true
                });
            } else {
                $state.go('app.projects');
            }
        }

        /**
         * Callback handler for 'create function' button
         * Creates function with defined data.
         */
        function createFunction() {

            // create function only when form is valid
            if (ctrl.functionFromTemplateForm.$valid && !lodash.isNil(ctrl.selectedTemplate)) {
                lodash.assign(ctrl.functionData.rendered.metadata, {
                    name: ctrl.functionName
                });

                if (lodash.isEmpty(ctrl.project) && ctrl.selectedProject.id !== 'new_project') {
                    ctrl.project = lodash.find(ctrl.projects, ['metadata.name', ctrl.selectedProject.id]);
                }

                if (lodash.has(ctrl.functionData, 'template')) {
                    ngDialog.open({
                        template: '<ncl-function-from-template-dialog data-close-dialog="closeThisDialog(template)" data-template="$ctrl.functionData"></ncl-function-from-template-dialog>',
                        plain: true,
                        scope: $scope,
                        className: 'ngdialog-theme-nuclio function-from-template-dialog-wrapper'
                    })
                        .closePromise
                        .then(function (data) {
                            if (!lodash.isNil(data.value)) {
                                lodash.set(ctrl.functionData, 'values', data.value);

                                ctrl.renderTemplate({ template: lodash.omit(ctrl.functionData, ['rendered', 'metadata']) })
                                    .then(function (response) {
                                        lodash.set(ctrl.functionData, 'rendered.spec', response.spec);

                                        goToEditCodeScreen();
                                    });
                            }
                        });
                } else {
                    goToEditCodeScreen();
                }
            }
        }

        /**
         * Set data returned by validating input component
         * @param {string} data - data to be set
         */
        function inputValueCallback(data) {
            $timeout(function () {
                if (!lodash.isNil(data)) {
                    lodash.set(ctrl, 'functionName', data);

                    ctrl.isCreateFunctionAllowed = lodash.isEmpty(ctrl.functionFromTemplateForm.$error);
                }
            });
        }

        /**
         * Checks which template type is selected.
         * Returns true if 'template' is equal to 'selectedTemplate'.
         * Which means that template from argument 'template' should be selected now.
         * @param {Object} templateName
         * @returns {boolean}
         */
        function isTemplateSelected(templateName) {
            return lodash.isEqual(templateName, ctrl.selectedTemplate);
        }

        /**
         * Hides or shows projects drop-down.
         * Show drop-down if 'Create Function' screen was reached from 'Projects' screen. Otherwise - hide drop-down
         * @returns {boolean}
         */
        function isProjectsDropDownVisible() {
            return $state.current.name === 'app.create-function';
        }

        /**
         * Search input callback
         */
        function onChangeSearchQuery() {
            paginateTemplates();
        }

        /**
         * Runtime filter drop-down callback
         * @param {Object} runtime - selected runtime
         */
        function onRuntimeFilterChange(runtime) {

            // set new runtime filter
            ctrl.selectedRuntimeFilter = runtime;

            paginateTemplates();
        }

        /**
         * Projects drop-down callback.
         * Sets selected project to function.
         * @param {Object} item - new selected project
         */
        function onProjectChange(item) {
            ctrl.project = lodash.find(ctrl.projects, ['metadata.name', item.id]);
            ctrl.isCreateFunctionAllowed = lodash.isEmpty(ctrl.functionFromTemplateForm.$error);
        }

        /**
         * Change pagination page callback
         * @param {number} page - page number
         */
        function paginationCallback(page) {
            ctrl.page.number = page;

            paginateTemplates();

            $timeout(function () {
                setReadMoreButtonsState(ctrl.templatesWorkingCopy);
            });
        }

        /**
         * Selects template.
         * Sets new template as selected
         * @param {Object} templateName - name of the template to be set
         */
        function selectTemplate(templateName) {
            if (!lodash.isEqual(templateName, ctrl.selectedTemplate)) {
                ctrl.selectedTemplate = templateName;

                // assign new template
                ctrl.functionData = angular.copy(ctrl.templatesWorkingCopy[ctrl.selectedTemplate]);
            }
        }

        function unselectTemplate(event) {
            ctrl.selectedTemplate = null;
            ctrl.functionData = null;

            event.preventDefault();
            event.stopPropagation();
        }
        //
        // Private methods
        //

        /**
         * Returns true if template's runtime is matched a selected runtime filter
         * @param {Object} template - template to filter.
         * @returns {boolean}
         */
        function filterByRuntime(template) {
            return ctrl.selectedRuntimeFilter.id === 'all' ||
                template.rendered.spec.runtime === ctrl.selectedRuntimeFilter.id;
        }

        /**
         * Returns true if template's title or description is matched a search query.
         * @param {Object} template - template to filter.
         * @returns {boolean}
         */
        function filterByTitleAndDescription(template) {
            var title = template.rendered.metadata.name.split(':')[0];
            var description = template.rendered.spec.description;

            // reset pagination to first page if one of the filters was applied
            if (!lodash.isEmpty(ctrl.searchQuery) || ctrl.selectedRuntimeFilter.id !== 'all') {
                ctrl.page.number = 0;
            }

            return lodash.isEmpty(ctrl.searchQuery) ||
                lodash.includes(title, ctrl.searchQuery) || lodash.includes(description, ctrl.searchQuery);
        }

        /**
         * Go to `app.project.function.edit.code` screen
         */
        function goToEditCodeScreen() {
            ctrl.toggleSplashScreen({ value: true });

            $state.go('app.project.function.edit.code', {
                isNewFunction: true,
                id: ctrl.project.metadata.name,
                functionId: ctrl.functionData.rendered.metadata.name,
                projectId: ctrl.project.metadata.name,
                projectNamespace: ctrl.project.metadata.namespace,
                functionData: ctrl.functionData.rendered
            });
        }

        /**
         * Initialize object for function from template
         */
        function initFunctionData() {

            // gets all available function templates
            ctrl.getFunctionTemplates()
                .then(function (response) {
                    ctrl.templatesWorkingCopy = response;

                    templatesOriginalObject = angular.copy(ctrl.templatesWorkingCopy);
                    ctrl.runtimeFilters = getRuntimeFilters();

                    initPagination();

                    $timeout(function () {
                        setReadMoreButtonsState(ctrl.templatesWorkingCopy);
                    });
                })
                .catch(function (error) {
                    var msg = $i18next.t('functions:ERROR_MSG.GET_FUNCTIONS_TEMPLATE', {lng: lng});

                    DialogsService.alert(lodash.get(error, 'data.error', msg));
                })
                .finally(function () {
                    ctrl.toggleSplashScreen({value: false});
                });
        }

        /**
         * Init data for pagination
         */
        function initPagination() {
            ctrl.page = {
                number: 0,
                size: 8
            };

            paginateTemplates();
        }

        /**
         * Gets runtime filters
         * @returns {Array.<{id: string, name: string, visible: boolean}>}
         */
        function getRuntimeFilters() {
            return [
                {
                    id: 'all',
                    name: $i18next.t('common:ALL', {lng: lng}),
                    visible: true
                },
                {
                    id: 'golang',
                    name: 'Go',
                    visible: true
                },
                {
                    id: 'python:2.7',
                    name: 'Python 2.7',
                    visible: true
                },
                {
                    id: 'python:3.6',
                    name: 'Python 3.6',
                    visible: true
                },
                {
                    id: 'dotnetcore',
                    name: '.NET Core',
                    visible: true
                },
                {
                    id: 'java',
                    name: 'Java',
                    visible: true
                },
                {
                    id: 'nodejs',
                    name: 'NodeJS',
                    visible: true
                },
                {
                    id: 'shell',
                    name: 'Shell',
                    visible: true
                },
                {
                    id: 'ruby',
                    name: 'Ruby',
                    visible: true
                }
            ];
        }

        /**
         * Paginates function's templates
         */
        function paginateTemplates() {

            // amount of visible items on one page
            var pageSize = $window.innerWidth > 1486 && $window.innerWidth < 1903 ? 9 : 8;

            ctrl.templatesWorkingCopy = lodash.chain(templatesOriginalObject)
                .filter(filterByRuntime)
                .filter(filterByTitleAndDescription)
                .thru(function (filteredTemplates) {
                    ctrl.page.total = Math.ceil(lodash.size(filteredTemplates) / pageSize);

                    return lodash.slice(filteredTemplates, (ctrl.page.number * pageSize), (ctrl.page.number * pageSize) + pageSize);
                })
                .keyBy(function (template) {
                    return template.rendered.metadata.name.split(':')[0] + ' (' + template.rendered.spec.runtime + ')';
                })
                .value();
        }

        /**
         * Converts projects for project drop-down.
         */
        function prepareProjects() {
            var newProject = {
                id: 'new_project',
                name: $i18next.t('functions:NEW_PROJECT', {lng: lng})
            };

            ctrl.selectedProject = lodash.isNil(ctrl.selectedProject) ? newProject : ctrl.selectedProject;

            ctrl.projectsList = lodash.chain(ctrl.projects)
                .map(function (project) {
                    return {
                        id: project.metadata.name,
                        name: project.spec.displayName
                    };
                })
                .sortBy(['name'])
                .value();

            ctrl.selectedProject = lodash.isEmpty(ctrl.projectsList)         ? newProject                     :
                                   ctrl.selectedProject.id !== 'new_project' ? ctrl.selectedProject           :
                                                                               lodash.first(ctrl.projectsList);
        }

        /**
         * Sets the flag to show `Read more...` in the end of template's description
         * when it is bigger than template's block can contain.
         * @param {Array} templates
         */
        function setReadMoreButtonsState(templates) {
            var templatesElements = $element.find('.template-description');

            lodash.forEach(templates, function (template) {
                var description = lodash.get(template, 'rendered.spec.description');
                var templateElement = lodash.find(templatesElements, ['innerHTML', description]);

                lodash.set(template, 'ui.readMore', templateElement.scrollHeight > angular.element(templateElement).height());
            });
        }
    }
}());
