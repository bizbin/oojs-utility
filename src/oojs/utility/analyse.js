oojs.define && oojs.define({
    name: 'analyse',
    namespace: 'oojs.utility',
    deps: {
    },
    $analyse: function () {
        this.fs = require('fs');
        this.path = require('path');
        this.md5 = require('md5');
    },

    /**
     * 分析指定路径文件的deps
     *
     * @param {string} path 文件路径
     * @return {Object} oojs类文件描述
     **/
    analyzeCls: function (path) {
        var classDescription = {};

        var depsList = [];
        var ujs = require('uglify-js');
        var fs = require('fs');
        var code = fs.readFileSync(path, 'utf-8');
        try {
            var ast = ujs.parse(code);            
        } catch (e) {
            console.log('------> uglify-js parse error <------:', '\n',
                'filepath', path, '\n',
                'message:', e.message, '\n',
                'line:', e.line, '\n',
                'col:', e.col, '\n',
                'pos:', e.pos, '\n'
            );
            console.log('------> exit process now <------');
            process.exit();
        }
        ast.figure_out_scope();
        ast.walk(new ujs.TreeWalker(function (node) {
            if (node instanceof ujs.AST_Call 
                && node.expression.property === 'define'
                && node.args.length === 1
                && node.args[0] instanceof ujs.AST_Object
            ) {
                var pList = node.args[0].properties;
                for (var i = 0, len = pList.length; i < len; i++) {
                    var pNode = pList[i];
                    if (pNode instanceof ujs.AST_ObjectProperty) {
                        switch (pNode.key) {
                            default :
                                classDescription[pNode.key] = pNode.value.value;
                                break;
                            case 'deps':
                                var depsClassList = pNode.value.properties;
                                var count = depsClassList.length;
                                for (var j = 0; j < count; j++) {
                                    var objectPropertyNode = depsClassList[j];
                                    if (objectPropertyNode instanceof ujs.AST_ObjectProperty) {
                                        var depsClassFullName = objectPropertyNode.value.value;
                                        depsList.push(depsClassFullName);
                                    }
                                }
                                classDescription.deps = depsList;
                                break;
                        }
                    }
                    else {
                        console.log(pNode);
                        console.log('--------------------');
                    }
                }
            }
        }));

        return {
            className: classDescription.name,
            filePath: path,
            description: classDescription,
            source: code,
            fileMD5: this.md5(code)
        };
    },

    /**
     * 递归加载指定类的所有依赖
     *
     * @param {strubg} clsFullName
     * @return {Object} 按依赖顺序加载的代码数组
     **/
    analyzeAllDeps: function (clsFullName, recordMap) {
        recordMap = recordMap || {};

        // 如果记录中已经存在
        if (recordMap.hasOwnProperty(clsFullName)) {
            return recordMap;
        }

        var filePath = oojs.getClassPath(clsFullName);
        var classData = this.analyzeCls(filePath);
        recordMap[clsFullName] = classData;
        var depsList = classData.deps || [];

        for (var i = 0, count = depsList.length; i < count; i++) {
            var depsClassFullName = depsList[i];
            // 如果记录中已经存在，忽略
            if (recordMap.hasOwnProperty(depsClassFullName)) {
                continue;
            }
            this.analyzeAllDeps(depsClassFullName, recordMap);
        }

        return recordMap;
    },

    /**
     * 检查循环依赖
     *
     * @return {boolean} 是否存在循环引用
     */
    checkDepsCircle: function (className, lastClsName, currentClsName, recordMap) {
        recordMap = recordMap || {};

        if (className === currentClsName) {
            console.log(className + ' 存在依赖循环');
            return true;
        }

        var classDes = this.depsRecordMap[currentClsName || className];
        if (!classDes) {
            return false;
        }
        recordMap[currentClsName] = 1;

        var deps = classDes.deps;
        if (deps && deps.length > 0) {
            for (var i = 0, len = deps.length; i < len; i++) {
                var depsClassName = deps[i];
                if (recordMap.hasOwnProperty(depsClassName) && recordMap[depsClassName] === 1) {
                    continue;
                }

                var result = this.checkDepsCircle(className, currentClsName, depsClassName, recordMap);
                // 递归的结果
                if (result === true) {
                    return true;
                } else {
                    //console.log('---------一条分支结束---------');
                }
            }
        }

        return false;
    },

    /**
     * 对依赖进行排序
     *
     * @param {Array} list
     * @param {Object} depsMap
     * @return {*|Array}
     */
    sortDeps: function (list, depsMap) {
        list = list || [];
        this.depsRecordMap = depsMap? depsMap: this.depsRecordMap;

        var count = 0;
        for (var key in this.depsRecordMap) {
            if (key && this.depsRecordMap.hasOwnProperty(key) && this.depsRecordMap[key]) {
                var classDes = this.depsRecordMap[key];
                // 出度为0
                if (
                    !classDes.hasOwnProperty('deps')
                    || classDes.deps.length === 0
                ) {
                    list.push(key);
                    this.clearDep(key);
                    this.depsRecordMap[key] = undefined;
                } else {
                    count++;
                }
            }
        }

        if (count > 0) {
            this.sortDeps(list);
        }

        return list;
    },

    /**
     * 对依赖进行裁剪
     * @param dep
     */
    clearDep: function (dep) {
        for (var key in this.depsRecordMap) {
            if (!key
                || !this.depsRecordMap.hasOwnProperty(key)
                || !this.depsRecordMap[key]
            ) {
                continue;
            }
            var classDes = this.depsRecordMap[key];
            if (classDes && classDes.hasOwnProperty('deps')) {
                for (var j = 0, count = classDes.deps.length; j < count; j++) {
                    if (classDes.deps[j] === dep) {
                        //console.log(classDes.name + '   ' + dep + ' is deleted');
                        classDes.deps.splice(j, 1);
                        break;
                    }
                }
            }
        }

    },

    /**
     * 深拷贝依赖记录
     *
     * @param depsRecordMap
     * @returns {{}}
     */
    deepCopyDeps: function (depsRecordMap) {
        var cloneObject = {};

        for (var moduleName in depsRecordMap) {
            var moduleDeps = depsRecordMap[moduleName]['deps'];
            cloneObject[moduleName] = {
                deps: []
            };

            if (moduleDeps && moduleDeps.length) {
                for (var i = 0; i < moduleDeps.length ; i++) {
                    cloneObject[moduleName]['deps'][i] = moduleDeps[i];
                }
            }
        }

        return cloneObject;
    },

    getCloneDeps: function () {
        return this.cloneDepsMap;
    },

    /**
     * 获得排序后的先后关系列表
     * @returns {*}
     */
    parseSortedDepsList: function (depsList) {
        this.depsRecordMap = {};
        // 按依赖关系分析出用到的所有类
        this.analyzeAllDeps(depsList);

        // 检查是否存在循环依赖
        var isCircle = false;
        var badSnakeList = [];
        for (var clsName in this.depsRecordMap) {
            var result = this.checkDepsCircle(clsName);
            if (result) {
                isCircle = true;
                badSnakeList.push(clsName);
            }
            //console.log(clsName + '  ' + result);
        }

        if (isCircle) {
            console.log('存在循环依赖，请解环');
            console.log(badSnakeList);
            return;
        }
        this.cloneDepsMap = this.deepCopyDeps(this.depsRecordMap);

        // 依赖关系排序
        return this.sortDeps();
    }

});
