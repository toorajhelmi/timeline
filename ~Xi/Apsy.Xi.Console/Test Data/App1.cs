using Apsy.Xi.Zar;

namespace Apsy.Xi.Console
{
    public class App1 : App
    {
        public App1()
        {
            AddAuthFeature();
            AddPostListFeature();
            AddCreatePostFeature();
            AddUserNetworkFeature();
            AddFollowUserFeature();
            AddSearchPostFeature();
            AddSettingsFeature();
        }

        private void AddAuthFeature()
        {
            var feature = new Feature();
            var signUpScreen = new Screen();
            var singInScreen = new Screen();
        }

        private void AddPostListFeature()
        {
            // Add code for PostList feature
        }

        private void AddCreatePostFeature()
        {
            // Add code for CreatePost feature
        }

        private void AddUserNetworkFeature()
        {
            // Add code for UserNetwork feature
        }

        private void AddFollowUserFeature()
        {
            // Add code for FollowUser feature
        }

        private void AddSearchPostFeature()
        {
            // Add code for SearchPost feature
        }

        private void AddSettingsFeature()
        {
            // Add code for Settings feature
        }
    }
}