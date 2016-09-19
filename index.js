var lightify = require('node-lightify');
var inherits = require('util').inherits;
var colorsys = require('colorsys');
var Accessory, Service, Characteristic, uuid, LightTemperature, LightStepTime;
var aData = {}; // here we store changed - outside - data from Lighitfy

module.exports = function(homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    Accessory = homebridge.hap.Accessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    uuid = homebridge.hap.uuid;
    makeLightTemperatureCharacteristic(); // create the characteristic for light temperature
    makeDimCharacteristic();

    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerPlatform("homebridge-lightify-native", "LightifyNativePlatform", LightifyNativePlatform);
};

// Platform constructor

function LightifyNativePlatform(log, config, api) {
    this.log = log;
    this.log("Lightify Platform Init");
    this.ip = config.ip;
    this.interval = config.interval; // for update

    // this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
    if (api) {
        // Save the API object as plugin needs to register new accessory via this object.
        this.api = api;
        // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories
        this.api.on('didFinishLaunching', function() {
            console.log("Plugin - DidFinishLaunching");
            console.log('updateperiod: ' + this.interval);
            // setInterval(this.update.bind(this), this.interval);
        }.bind(this));
        this.handleError.bind(this);
    }
}

LightifyNativePlatform.prototype = {
    accessories: function(callback) {
        this.log("Fetching the one accessory");
        var foundAccessories = [];
        var self = this;
        this.log("start data");
        this.log(this.ip);
        // Start lightyfy
        lightify.start(this.ip, this.handleError).then(function(data) {
            // discover the devices
            lightify.discovery().then(function(data) {
                //console.log(data.result);
                // here we loop etc to get the accessories
                for (var key in data.result) {
                    var macAdr = data.result[key].mac;
                    //console.log(data.result[key]);
                    // create accessory
                    var acc = new LightifyAccessory(self, self.log, data.result[key]);
                    foundAccessories.push(acc);
                };
                callback(foundAccessories);
                return
            });
        });
    }
}

LightifyNativePlatform.prototype.handleError = function(theError) {
    console.log("//////////////////// " + theError);
    lightify.start(this.ip, this.handleError).then(function(data) {});

}

LightifyNativePlatform.prototype.update = function(callback) {
    // update the status of all accessories
    this.log('update platform');
    //console.log(aData);


    //lightify.start(this.ip).then(function(data) {
    // discover the devices
    lightify.discovery().then(function(data) {
        //console.log(data.result);
        // here we loop etc to get the accessories
        for (var key in data.result) {
            var macAdr = data.result[key].mac;
            aData[macAdr] = data.result[key]; // store the changes in the global variable
        };
        console.log('data received');
    });
    // });
}

function LightifyAccessory(platform, log, data) {
    // create the accessory
    //console.log(data);
    this.platform = platform;
    this.log = log;
    this.data = data;
    this.mac = data["mac"];
    //console.log(this.mac);
    this.steptime = 1;
    this.generalStepTime = 1;
    this.name = data["name"];
    this.deviceType = data["type"];
    this.brightness = data["brightness"];
    this.red = data["red"];
    this.green = data["green"];
    this.blue = data["blue"];
    this.white = data["alpha"]; // is this white or alpha ??
    var hsl = colorsys.rgb_to_hsv({ r: this.red, g: this.green, b: this.blue }); // returns array
    this.hue = hsl[0].h;
    this.saturation = hsl[0].s;
    //console.log(hsl);
    //console.log(this.hue);

    this.temperature = data["temperature"];
    this.status = data["status"];
    this.binaryState = this.status; // bulb state, default is OFF
    //setInterval(this.update.bind(this), this.platform.interval + 100);
    this.log("Starting a lightify lamp device  '" + this.name);
}
LightifyAccessory.prototype.update = function(callback) {
    // individual update of an accessory
    //console.log(aData[this.mac]);
    var newData = aData[this.mac];
    if (newData != undefined) {
        this.status = newData["status"];
        this.binaryState = this.status;
        this.name = newData["name"];
        this.deviceType = newData["type"];
        this.brightness = newData["brightness"];
        this.red = newData["red"];
        this.green = newData["green"];
        this.blue = newData["blue"];
        this.white = newData["alpha"]; // is this white or alpha ??
        var hsl = colorsys.rgb_to_hsv({ r: this.red, g: this.green, b: this.blue }); // returns array
        this.hue = hsl[0].h;
        this.saturation = hsl[0].s;
    }
}

LightifyAccessory.prototype.getPowerOn = function(callback) {
    this.log("Power state for the '%s' is %s", this.name, this.binaryState);
    if (callback) callback(null, this.binaryState);
}

LightifyAccessory.prototype.setPowerOn = function(powerOn, callback) {
    this.binaryState = powerOn ? 1 : 0; // wemo langauge
    this.log("Set power state on the '%s' to %s", this.name, this.binaryState);
    var that = this;
    lightify.start(this.platform.ip, handleError).then(function() {
        lightify.node_on_off(that.mac, that.binaryState);
        if (callback) callback(null);
    });
}

LightifyAccessory.prototype.setBrightness = function(level, callback) {
    if (this.brightness != level) {
        this.brightness = level;
        this.binaryState = 1;
        // mac address, brightness 0-255, time to dim
        this.log("Set brightness on the '%s' to %s", this.name, this.brightness);
        var that = this;
        lightify.start(this.platform.ip, handleError).then(function() {
            lightify.node_brightness(that.mac, that.brightness, that.steptime).then(function() {
                if (lightify.isColorSupported(that.deviceType)) {
                    var rgb = colorsys.hsv_to_rgb({ h: that.hue, s: that.saturation, v: that.brightness });
                    console.log(rgb);
                    lightify.node_color(that.mac, rgb.r, rgb.g, rgb.b, 255, that.generalStepTime);
                    return;
                }
            });
            return;

        });
        if (callback) callback(null);

    }
}

LightifyAccessory.prototype.getBrightness = function(callback) {
    this.log("Brightness for the '%s' is %s", this.name, this.brightness);
    if (callback) callback(null, this.brightness);
}

LightifyAccessory.prototype.setHue = function(level, callback) {
    if (this.hue != level) {
        this.hue = level;
        var rgb = colorsys.hsv_to_rgb({ h: this.hue, s: this.saturation, v: this.brightness });
        console.log(rgb);
        var that = this;
        lightify.start(this.platform.ip, handleError).then(function() {
            lightify.node_color(this.mac, rgb.r, rgb.g, rgb.b, 255, that.generalStepTime);
            this.log("Set hue on the '%s' to %s", that.name, that.hue);
            return;
        });
        if (callback) callback(null);
    };
}

LightifyAccessory.prototype.getHue = function(callback) {
    this.log("Hue the '%s' is %s", this.name, this.hue);
    if (callback) callback(null, this.hue);
}

LightifyAccessory.prototype.setSaturation = function(level, callback) {
    if (this.saturation != level) {
        this.saturation = level;
        var rgb = colorsys.hsv_to_rgb({ h: this.hue, s: this.saturation, v: this.brightness });
        console.log(rgb);
        var that = this;
        lightify.start(this.platform.ip, handleError).then(function() {
            lightify.node_color(this.mac, rgb.r, rgb.g, rgb.b, 255, that.generalStepTime);
            this.log("Set saturation on the '%s' to %s", this.name, that.saturation);
            return;
        });
        if (callback) callback(null);
    }
}

LightifyAccessory.prototype.getSaturation = function(callback) {
    this.log("Saturation the '%s' is %s", this.name, this.saturation);
    if (callback) callback(null, this.saturation);
}

LightifyAccessory.prototype.setLightTemperature = function(level, callback) {
    if (this.temperature != level) {
        this.temperature = level;
        var that = this;
        lightify.start(this.platform.ip, handleError).then(function() {
            lightify.node_temperature(that.mac, that.temperature, that.generalStepTime); // mac address, temperature 2600-6500, time to dim
            this.log("Set temperature on the '%s' to %s", that.name, that.temperature);
            return;
        });
        if (callback) callback(null);
    }
}

LightifyAccessory.prototype.getLightTemperature = function(callback) {
    this.log("temperature for the '%s' is %s", this.name, this.temperature);
    if (callback) callback(null, this.temperature);
}

LightifyAccessory.prototype.setLightStepTime = function(level, callback) {
    if (this.steptime != level) {
        this.steptime = level;
        this.log("Set steptime on the '%s' to %s", this.name, this.steptime);
    };
    if (callback) callback(null);
}

LightifyAccessory.prototype.getLightStepTime = function(callback) {
    this.log("steptime for the '%s' is %s", this.name, this.steptime);
    if (callback) callback(null, this.steptime);
}

LightifyAccessory.prototype.identify = function(callback) {
    this.log("Identify requested!");
    if (callback) callback(); // success
}

LightifyAccessory.prototype.getServices = function() {

    var lightbulbService = new Service.Lightbulb(this.name);
    lightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerOn.bind(this))
        .on('set', this.setPowerOn.bind(this));

    if (lightify.isBrightnessSupported(this.deviceType)) {
        lightbulbService.addCharacteristic(new Characteristic.Brightness)
            .on('get', this.getBrightness.bind(this))
            .on('set', this.setBrightness.bind(this));
        /*
                console.log('Steptime service');
                lightbulbService.addCharacteristic(LightStepTime)
                    .on('set', this.setLightStepTime.bind(this))
                    .on('get', this.getLightStepTime.bind(this));
        */

    }

    if (lightify.isColorSupported(this.deviceType)) {
        lightbulbService.addCharacteristic(new Characteristic.Hue)
            .on('set', this.setHue.bind(this))
            .on('get', this.getHue.bind(this));

        lightbulbService.addCharacteristic(new Characteristic.Saturation)
            .on('set', this.setSaturation.bind(this))
            .on('get', this.getSaturation.bind(this));
    }

    if (lightify.isTemperatureSupported(this.deviceType)) {
        lightbulbService.addCharacteristic(LightTemperature)
            .on('set', this.setLightTemperature.bind(this))
            .on('get', this.getLightTemperature.bind(this));
    }

    return [lightbulbService];
}

// Custom Characteristics
function makeLightTemperatureCharacteristic() {

    LightTemperature = function() {
        var charUUID = uuid.generate('xSamplePlatform:customchar:LightTemperature');
        Characteristic.call(this, 'Light Temperature [Kelvin]', charUUID);
        //console.log('lt characteristic');
        //console.log(charUUID);
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: 'Kelvin',
            maxValue: 6500,
            minValue: 2000,
            minStep: 1,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(LightTemperature, Characteristic);
}

function makeDimCharacteristic() {

    LightStepTime = function() {
        var charUUID = uuid.generate('xSamplePlatform:customchar:StepTime');
        Characteristic.call(this, 'Dim Time [sec/10]', charUUID);
        //console.log('lt characteristic');
        //console.log(charUUID);
        this.setProps({
            format: Characteristic.Formats.UINT16,
            unit: 'sec/10',
            maxValue: 1000,
            minValue: 5,
            minStep: 10,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
        });
        this.value = this.getDefaultValue();
    };
    inherits(LightStepTime, Characteristic);
}