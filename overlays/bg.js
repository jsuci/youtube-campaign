// Define a function to generate a random number between 0 and 255
function getRandomValue() {
  return Math.floor(Math.random() * 256);
}

// Get the folder containing the PNG files
var inputFolder = Folder.selectDialog("Select the folder containing the PNG files");

// Create the output folder if it doesn't already exist
var outputFolder = new Folder(inputFolder + "/PNG");
if (!outputFolder.exists) {
  outputFolder.create();
}

// Get an array of all the PNG files in the input folder
var inputFiles = inputFolder.getFiles("*.png");

// Loop through the PNG files
for (var i = 0; i < inputFiles.length; i++) {
  // Open the PNG file
  var file = inputFiles[i];
  var doc = app.open(file);
  var transparentLayer = doc.layers[0];
  var repeatCount = 5;

  for (var j = 0; j < repeatCount; j++) {
    // Add a new layer for the current background color
    var colorLayer = doc.artLayers.add();

    // Make the color layer the active layer
    doc.activeLayer = colorLayer;

    // Create a new SolidColor object with random RGB values
    var randomColor = new SolidColor();
    randomColor.rgb.red = getRandomValue();
    randomColor.rgb.green = getRandomValue();
    randomColor.rgb.blue = getRandomValue();

    // Fill the selection with the current foreground color (which is set to the current background color in the loop)
    doc.selection.fill(randomColor);

    // Move the color layer behind the transparent layer
    colorLayer.move(transparentLayer, ElementPlacement.PLACEAFTER);
    
    // Save the modified PNG file in the output folder
    var newFileName = doc.name.slice(0, -4) + " background " + i + j + ".png";
    var outputFileName = outputFolder + "/" + newFileName;
    var saveOptions = new ExportOptionsSaveForWeb();
    saveOptions.PNG8 = false;
    saveOptions.transparency = true;
    saveOptions.interlaced = false;
    saveOptions.quality = 100;
    saveOptions.includeProfile = false;
    saveOptions.format = SaveDocumentType.PNG; 
    doc.exportDocument(new File(outputFileName), ExportType.SAVEFORWEB, saveOptions);

    // Remove the color layer to return the document to its original state
    colorLayer.remove();
  }
  
  // Close the document without saving changes
  doc.close(SaveOptions.DONOTSAVECHANGES);
}
