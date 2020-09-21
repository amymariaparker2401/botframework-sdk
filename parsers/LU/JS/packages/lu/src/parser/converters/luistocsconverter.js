const parse_multi_platform_luis_1 = require("./../luis/propertyHelper");
const LuisGenBuilder = require('./../luis/luisGenBuilder')
const exception = require('./../utils/exception');
const Writer = require("./helpers/writer");
const lodash = require("lodash")

module.exports = {
    writeFromLuisJson: async function(luisJson, className, space, outPath) {
        const app = LuisGenBuilder.build(luisJson);
        let writer = new Writer();
        await writer.setOutputStream(outPath);
        this.header(space, className, writer);
        writer.writeLine();
        this.intents(app.intents, writer);
        this.entities(app, writer);
        writer.writeLine();
        writer.writeLineIndented([
            '[JsonExtensionData(ReadData = true, WriteData = true)]',
            'public IDictionary<string, object> Properties {get; set; }'
        ]);
        this.converter(className, writer);
        this.onError(writer);
        this.topScoringIntent(writer);
        writer.decreaseIndentation();
        writer.writeLineIndented('}'); // Class
        writer.decreaseIndentation();
        writer.writeLineIndented('}'); // Namespace
        await writer.closeOutputStream();
    },
    header: function(space, className, writer) {
        writer.writeLine([
            '// <auto-generated>',
            '// Code generated by luis:generate:cs',
            '// Tool github: https://github.com/microsoft/botframework-cli',
            '// Changes may cause incorrect behavior and will be lost if the code is',
            '// regenerated.',
            '// </auto-generated>',
            'using Newtonsoft.Json;',
            'using Newtonsoft.Json.Serialization;',
            'using System;',
            'using System.Collections.Generic;',
            'using Microsoft.Bot.Builder;',
            'using Microsoft.Bot.Builder.AI.Luis;',
            `namespace ${space}`,
            '{'
        ]);
        writer.increaseIndentation();
        //Main class
        writer.writeLineIndented([
            `public partial class ${className}: IRecognizerConvert`,
            '{'
        ]);
        writer.increaseIndentation();
        //Text
        writer.writeLineIndented([
            '[JsonProperty("text")]',
            'public string Text;'
        ]);
        writer.writeLine();
        writer.writeLineIndented([
            '[JsonProperty("alteredText")]',
            'public string AlteredText;'
        ]);
    },
    intents: function(intents, writer) {
        writer.writeLineIndented('public enum Intent {');
        writer.increaseIndentation();
        const lastIntent = intents.pop();
        intents.forEach((intent) => {
            writer.writeLineIndented(`${intent},`);
        });
        if (lastIntent) {
            writer.writeLineIndented(lastIntent);
        }
        writer.decreaseIndentation();
        writer.writeLineIndented([
            '};',
            '[JsonProperty("intents")]',
            'public Dictionary<Intent, IntentScore> Intents;'
        ]);
    },
    entities: function(app, writer) {
        writer.writeLine();
        writer.writeLineIndented([
            'public class _Entities',
            '{'
        ]);
        writer.increaseIndentation();
        this.writeEntityBlock(app.entities, 'Simple entities', (entity) => {
            writer.writeLineIndented(this.getEntityWithType(entity));
        }, writer);
        this.writeEntityBlock(app.prebuiltEntities, 'Built-in entities', (entities) => {
            const entityType = entities[0];
            entities.forEach(entity => {
                writer.writeLineIndented(this.getEntityWithType(entity, entityType));
            });
        }, writer);
        this.writeEntityBlock(app.closedLists, 'Lists', (entity) => {
            writer.writeLineIndented(this.getEntityWithType(entity, 'list'));
        }, writer);
        this.writeEntityBlock(app.regex_entities, 'Regex entities', (entity) => {
            writer.writeLineIndented(this.getEntityWithType(entity));
        }, writer);
        this.writeEntityBlock(app.patternAnyEntities, 'Pattern.any', (entity) => {
            writer.writeLineIndented(this.getEntityWithType(entity));
        }, writer);
        // Composites
        if (app.composites.length > 0) {
            writer.writeLine();
            writer.writeLineIndented('// Composites');
            let first = true;
            app.composites.forEach(composite => {
                if (first) {
                    first = false;
                }
                else {
                    writer.writeLine();
                }
                writer.writeLineIndented([
                    `public class _Instance${lodash.upperFirst(composite.compositeName)}`,
                    '{'
                ]);
                writer.increaseIndentation();
                composite.attributes.forEach(attr => {
                    writer.writeLineIndented([
                        `public InstanceData[] ${parse_multi_platform_luis_1.jsonPropertyName(attr)};`
                    ]);
                });
                writer.decreaseIndentation();
                writer.writeLineIndented([
                    '}',
                    `public class ${lodash.upperFirst(composite.compositeName)}Class`,
                    '{'
                ]);
                writer.increaseIndentation();
                composite.attributes.forEach(attr => {
                    writer.writeLineIndented(this.getEntityWithType(attr, app.closedLists.includes(attr) ? 'list' : attr));

                });
                writer.writeLineIndented([
                    '[JsonProperty("$instance")]',
                    `public _Instance${lodash.upperFirst(composite.compositeName)} _instance;`
                ]);
                writer.decreaseIndentation();
                writer.writeLineIndented([
                    '}',
                    `public ${lodash.upperFirst(composite.compositeName)}Class[] ${composite.compositeName};`
                ]);
            });
        }
        // Instance
        writer.writeLine();
        writer.writeLineIndented([
            '// Instance',
            'public class _Instance',
            '{'
        ]);
        writer.increaseIndentation();
        app.getInstancesList().forEach(instanceData => {
            writer.writeLineIndented(`public InstanceData[] ${parse_multi_platform_luis_1.jsonPropertyName(instanceData)};`);
        });
        writer.decreaseIndentation();
        writer.writeLineIndented([
            '}',
            '[JsonProperty("$instance")]',
            'public _Instance _instance;'
        ]);
        writer.decreaseIndentation();
        writer.writeLineIndented([
            '}',
            '[JsonProperty("entities")]',
            'public _Entities Entities;'
        ]);
    },
    getEntityWithType: function(entityNameOrObject, entityType = '') {
        if (typeof entityNameOrObject === 'object' && 'name' in entityNameOrObject){
            if ('instanceOf' in entityNameOrObject){
                entityType = entityNameOrObject.instanceOf
                entityNameOrObject = entityNameOrObject.name
            } else if (entityNameOrObject.compositeInstanceOf) {
                let name = parse_multi_platform_luis_1.jsonPropertyName(entityNameOrObject.name)
                return `public ${lodash.upperFirst(name)}Class[] ${name};`
            } else {
                throw (new exception("Invalid LuisGen object: cannot parse entity"))
            }
        }
        let result = '';
        switch (entityType) {
            case 'age':
                result = 'public Age[]';
                break;
            case 'datetimeV2':
                result = 'public DateTimeSpec[]';
                break;
            case 'dimension':
                result = 'public Dimension[]';
                break;
            case 'geographyV2':
                result = 'public GeographyV2[]';
                break;
            case 'list':
                result = 'public string[][]';
                break;
            case 'money':
                result = 'public Money[]';
                break;
            case 'ordinalV2':
                result = 'public OrdinalV2[]';
                break;
            case 'temperature':
                result = 'public Temperature[]';
                break;
            case 'number':
            case 'ordinal':
            case 'percentage':
                result = 'public double[]';
                break;
            default:
                result = 'public string[]';
        }
        return result + ` ${parse_multi_platform_luis_1.jsonPropertyName(entityNameOrObject)};`;
    },
    converter: function(className, writer) {
        writer.writeLine();
        writer.writeLineIndented([
            'public void Convert(dynamic result)',
            '{'
        ]);
        writer.increaseIndentation();
        writer.writeLineIndented(
            `var app = JsonConvert.DeserializeObject<${className}>(`,
        );
        writer.increaseIndentation();
        writer.writeLineIndented(
            'JsonConvert.SerializeObject('
        );
        writer.increaseIndentation();
        writer.writeLineIndented([
            'result,',
            'new JsonSerializerSettings { NullValueHandling = NullValueHandling.Ignore, Error = OnError }'
        ]);
        writer.decreaseIndentation();
        writer.writeLineIndented(')');
        writer.decreaseIndentation();
        writer.writeLineIndented([
            ');',
            'Text = app.Text;',
            'AlteredText = app.AlteredText;',
            'Intents = app.Intents;',
            'Entities = app.Entities;',
            'Properties = app.Properties;'
        ]);
        writer.decreaseIndentation();
        writer.writeLineIndented('}');
    },
    onError: function(writer) {
        writer.writeLine();
        writer.writeLineIndented([
            'private static void OnError(object sender, ErrorEventArgs args)',
            '{'
        ]);
        writer.increaseIndentation();
        writer.writeLineIndented([
            '// If needed, put your custom error logic here',
            'Console.WriteLine(args.ErrorContext.Error.Message);',
            'args.ErrorContext.Handled = true;'
        ]);
        writer.decreaseIndentation();
        writer.writeLineIndented('}');
    },
    topScoringIntent: function(writer) {
        writer.writeLine();
        writer.writeLineIndented([
            'public (Intent intent, double score) TopIntent()',
            '{'
        ]);
        writer.increaseIndentation();
        writer.writeLineIndented([
            'Intent maxIntent = Intent.None;',
            'var max = 0.0;',
            'foreach (var entry in Intents)',
            '{'
        ]);
        writer.increaseIndentation();
        writer.writeLineIndented([
            'if (entry.Value.Score > max)',
            '{'
        ]);
        writer.increaseIndentation();
        writer.writeLineIndented([
            'maxIntent = entry.Key;',
            'max = entry.Value.Score.Value;'
        ]);
        writer.decreaseIndentation();
        writer.writeLineIndented('}');
        writer.decreaseIndentation();
        writer.writeLineIndented([
            '}',
            'return (maxIntent, max);'
        ]);
        writer.decreaseIndentation();
        writer.writeLineIndented('}');
    },
    writeEntityBlock: function(entities, message, logic, writer) {
        if (entities.length > 0) {
            if (message !== '') {
                writer.writeLineIndented(`// ${message}`);
            }
            entities.forEach(logic);
            writer.writeLine();
        }
    }
}