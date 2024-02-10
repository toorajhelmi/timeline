namespace Apsy.Xi;

public class RequirementProcessor
{
    private void ParseExpectation(string expectation)
    {
        var instructions = "Assuming the text I will proivde is a softwate requirement, try to extract the following information from the it: (if that peice is not mentioned, set it to 'any') \n\n" +
                        "1. The condition\n" +
                        "2. The acceptance criteria\n" +
                        "3. The role\n" +
                        "4. The RequirementType (Functional, Nonfunctiona, Design";

        return gptService.ProcessText<Requirement>(instructions, expectation);
    }

    
    private void FindPrerequisites(string expectation, Requirement requirement)
    {
        var instructions = "Given the requirements included in the context, find the ones that the following new requirment depends on.\n\n" +
            "Note: A depends on B if without B, A cannot be applied.\n" +
            "Return the list of requirment Ids that the new requirement depends on.";

        return gptService.ProcessText<Requirement>(instructions, requirement.originalText);
    }
}
