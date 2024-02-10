// See https://aka.ms/new-console-template for more information
using Research.DiscArch.Console;

var experiment = new CategorizedReqsExperiment();
experiment.Run(Research.DiscArch.TestData.SystemNames.Messaging);

//var experiment = new OprimizationExperiment();
//experiment.Run();

Console.ReadLine();

