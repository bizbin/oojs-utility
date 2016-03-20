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
     * 解析类文件
     * @param {string} fullname
     */
    parseCls: function (fullname) {
        // 处理oojs核心 module 引用
        if (fullname === 'oojs.core') {
            return this.parseCoreFile(fullname);
        }
        else {
            return this.parseByAST(fullname);
        }
    },

    /**
     * 对oojs核心库的特殊解析
     *
     * @param fullname
     * @returns {{className: *, fullName: *, filePath: string, description: string, source: string, fileMD5: *}}
     */
    parseCoreFile: function (fullname) {
        var path = "./node_modules/node-oojs/bin/" + fullname + ".js";

        var code = this.fs.readFileSync(path, 'utf-8');
        return {
            className: fullname,
            fullName: fullname,
            filePath: path,
            description: 'core',
            source: code,
            fileMD5: this.md5(code)
        };
    },

    /**
     * 根据AST分析指定路径文件的deps
     *
     * @param {string} fullname 文件路径
     * @return {Object} oojs类文件描述
     **/
    parseByAST: function (fullname) {
        var path = oojs.getClassPath(fullname);

        if (/oojs\.[.+]]/gi.test(fullname)) {
            path = './node_modules/node-oojs/bin/' + fullname + '.js';
        }
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
     * @param {string} clsFullName 要分析的类名
     * @param {Object} recordMap 已确定导入类记录
     * @param {Object} filterRecord 需要过滤的类
     * @return {Object} 递归分析出的所有依赖的类集合
     **/
    analyzeAllDeps: function (clsFullName, recordMap, filterRecord) {
        recordMap = recordMap || {};

        // 如果记录或过滤列表中已经存在
        if (recordMap[clsFullName] || (filterRecord && filterRecord[clsFullName])) {
            return recordMap;
        }

        // 处理oojs核心 module 引用
        if (clsFullName && clsFullName.indexOf('oojs') > -1) {
            recordMap[clsFullName] = this.parseCoreFile(clsFullName);
            return recordMap;
        }
        var classFileModel = this.parseCls(clsFullName);
        recordMap[clsFullName] = classFileModel;

        var classData = classFileModel.description;
        var depsList = classData.deps || [];
        for (var i = 0, count = depsList.length; i < count; i++) {
            var depsClassFullName = depsList[i];
            // 如果记录中已经存在，忽略
            if (recordMap.hasOwnProperty(depsClassFullName) || (filterRecord && filterRecord[depsClassFullName])) {
                continue;
            }
            this.analyzeAllDeps(depsClassFullName, recordMap, filterRecord);
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
    sortDeps: function (depsMap) {
        // 出度不为0计数
        var count = 0;
        var tempList = [];
        for (var key in depsMap) {
            if (key && depsMap[key] && depsMap.hasOwnProperty(key)) {
                var fileModel = depsMap[key];
                var classDes = fileModel.description;
                // 出度为0
                if (
                    !classDes
                    || !classDes.hasOwnProperty('deps')
                    || classDes.deps.length === 0
                ) {
                    tempList.push(key);
                    this.clearDep(key, depsMap);
                    depsMap[key] = undefined;
                }
                else {
                    count++;
                }
            }
        }

        // 相同出度的排个序
        tempList.sort();

        if (count === 0) {
            return tempList;
        }

        return tempList.concat(this.sortDeps(depsMap));
    },

    /**
     * 对依赖进行裁剪
     * @param dep
     */
    clearDep: function (dep, depsMap) {
        for (var key in depsMap) {
            if (!key
                || !depsMap.hasOwnProperty(key)
                || !depsMap[key]
            ) {
                continue;
            }
            var fileModel = depsMap[key];
            var classDes = fileModel.description;
            if (classDes && classDes['deps'] && classDes.hasOwnProperty('deps')) {
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
     * 获得排序后的先后关系列表
     *
     * @param {string} clsFullName 类全名
     * @returns {*}
     */
    parseSortedDepsList: function (clsFullName) {
        // 按依赖关系分析出用到的所有类
        var allDependsMap = this.analyzeAllDeps(clsFullName);

        // 检查是否存在循环依赖
        var isCircle = false;
        var badSnakeList = [];
        for (var clsName in allDependsMap) {
            var result = this.checkDepsCircle(clsName);
            if (result) {
                isCircle = true;
                badSnakeList.push(clsName);
            }
        }

        if (isCircle) {
            console.log('存在循环依赖，请解环');
            console.log(badSnakeList);
            return;
        }

        // 依赖关系排序
        var list = null;
        this.sortDeps(list, allDependsMap);
        return list;
    }

});
