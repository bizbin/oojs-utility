/* globals oojs */
/**
 * @file
 * @author biz
 **/
oojs.define({
    name: 'lang',
    namespace: 'oojs.utility',
    deps: {},
    $lang: function () {
    },
    deepCopyArray: function (targetArr) {
        var arr = [];
        for (var i = 0; i < targetArr.length; i++) {
            arr[i] = targetArr[i];
        }
        return arr;
    },
    deepCopyObject: function (sourceObj) {
        var targetObj = {};

        var isObject = function (testSubject) {
            return Object.prototype.toString.call(testSubject) == '[object Object]'? true: false;
        }

        var isArray = function (testSubject) {
            return Object.prototype.toString.call(testSubject) == '[object Array]'? true: false;
        }

        for (var key in sourceObj) {

            var value = sourceObj[key];

            if (isObject(value)) {
                targetObj[key] = this.deepCopyObject(value);
            }
            else if (isArray(value)) {
                targetObj[key] = this.deepCopyArray(value);
            }
            else {
                targetObj[key] = value;
            }
        }
        return targetObj;
    }
});
